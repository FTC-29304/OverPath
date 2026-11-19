import com.qualcomm.hardware.lynx.LynxModule;
import com.qualcomm.robotcore.hardware.*;
import com.qualcomm.robotcore.util.ElapsedTime;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;
import org.firstinspires.ftc.teamcode.overpath.OverPath;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.*;

public class Harness4 {
  static final double READ_MS = 2.0, BULK_MS = 2.4, WRITE_MS = 1.6, IMU_MS = 2.5, VOLT_MS = 2.0;

  static final double[] STRAFE = {1, -1, -1, 1};
  static final double[] TURN = {-1, 1, -1, 1};
  static final double[][] WHEEL_AT = {{6, 6}, {6, -6}, {-6, 6}, {-6, -6}};

  static class Sim {
    final Random rnd;
    double x, y, h;
    double vf, vs, om;
    final double[] u = new double[4];
    final double[] enc = new double[4];
    final double[] power = new double[4];
    final double[] amax = new double[4];
    final double tpi, strafeMult = 1.1, R = 8, maxIpsNominal = 50, kc = 150, tauMotor = 0.06, tauBrake = 0.04;
    double jr = 2.3;
    double volts = 13.0;
    double strafeEff = 1.0;
    double[][] patches;
    LynxModule hub = new LynxModule();
    final double[] cached = new double[4];
    final boolean[] valid = new boolean[4];
    double clock = 0;
    int writes = 0, reads = 0;

    Sim(long seed, double tpi, double x, double y, double h) {
      rnd = new Random(seed);
      this.tpi = tpi; this.x = x; this.y = y; this.h = h;
      double[] dist = {1.05, 1.05, 0.95, 0.95};
      for (int i = 0; i < 4; i++) amax[i] = 180 * dist[i] * (1 + 0.08 * rnd.nextGaussian());
      for (int i = 0; i < 4; i++) cached[i] = 0;
      strafeEff = 1 + 0.03 * rnd.nextGaussian();
    }

    void advance(double ms) {
      int n = (int) Math.floor(ms);
      double rest = ms - n;
      for (int i = 0; i < n; i++) physics(0.001);
      if (rest > 1e-9) physics(rest / 1000);
      ElapsedTime.fakeNanos += (long) (ms * 1e6);
      clock += ms / 1000;
    }

    int lifted = -1;
    double deadband = 0;
    final boolean[] motorFlip = new boolean[4];
    final boolean[] encFlip = new boolean[4];
    boolean walls = false;
    final boolean[] openLoop = new boolean[4];
    double stallAccel = 520;
    double len = 18, wid = 18;
    boolean touching = false;
    double encNoise = 0, encScale = 1;
    boolean wasMoving = false;

    double gripAt(int i) {
      if (i == lifted) return amax[i] * 0.05;
      if (patches == null) return amax[i];
      double hr = Math.toRadians(h);
      double wx = x + WHEEL_AT[i][0] * Math.cos(hr) - WHEEL_AT[i][1] * Math.sin(hr);
      double wy = y + WHEEL_AT[i][0] * Math.sin(hr) + WHEEL_AT[i][1] * Math.cos(hr);
      for (double[] p : patches) if (wx > p[0] && wx < p[1] && wy > p[2] && wy < p[3]) return amax[i] * p[4];
      return amax[i];
    }

    void physics(double dt) {
      double achievable = maxIpsNominal * volts / 13.0;
      double omr = Math.toRadians(om);
      double af = 0, as = 0, at = 0, pSum = 0;
      for (int i = 0; i < 4; i++) {
        double pe = motorFlip[i] ? -power[i] : power[i];
        pe = Math.abs(pe) < deadband ? 0 : Math.signum(pe) * (Math.abs(pe) - deadband) / (1 - deadband);
        double tgt = Math.max(-achievable, Math.min(achievable, pe * maxIpsNominal * 0.92));
        double tau = power[i] == 0 ? tauBrake : tauMotor;
        double g = vf + STRAFE[i] * vs * strafeMult + TURN[i] * omr * R;
        double grip = gripAt(i);
        double a = Math.max(-grip, Math.min(grip, kc * (u[i] - g)));
        if (openLoop[i] && power[i] != 0) {
          double push = stallAccel * (pe - u[i] / maxIpsNominal);
          u[i] += (push - a) * jr * dt;
        } else {
          double cap = stallAccel * jr;
          u[i] += (Math.max(-cap, Math.min(cap, (tgt - u[i]) / tau)) - a * jr) * dt;
        }
        af += a; as += STRAFE[i] * a; at += TURN[i] * a;
        enc[i] += u[i] * dt * tpi * encScale;
        pSum += Math.abs(power[i]);
      }
      vf += af / 4 * dt;
      vs += as / 4 / strafeMult * strafeEff * dt;
      om += Math.toDegrees(at / 4 / R) * dt;
      vf -= vf * 0.4 * dt; vs -= vs * 0.4 * dt; om -= om * 0.4 * dt;
      if (encNoise > 0) {
        boolean moving = Math.hypot(vf, vs) > 0.5 || Math.abs(om) > 5;
        if (wasMoving && !moving) encScale = 1 + encNoise * rnd.nextGaussian();
        wasMoving = moving;
      }
      double hr = Math.toRadians(h);
      double nx = x + (vf * Math.cos(hr) + vs * Math.sin(hr)) * dt;
      double ny = y + (vf * Math.sin(hr) - vs * Math.cos(hr)) * dt;
      double nh = h + om * dt;
      if (walls) {
        touching = false;
        for (int pass = 0; pass < 4; pass++) {
          double c = Math.cos(Math.toRadians(nh)), sn = Math.sin(Math.toRadians(nh));
          double[][] k = {{len / 2, wid / 2}, {len / 2, -wid / 2}, {-len / 2, -wid / 2}, {-len / 2, wid / 2}};
          for (double[] q : k) {
            double qx = nx + q[0] * c - q[1] * sn, qy = ny + q[0] * sn + q[1] * c, over;
            if ((over = qx - 72) > 0) { nx -= over; touching = true; }
            if ((over = -72 - qx) > 0) { nx += over; touching = true; }
            if ((over = qy - 72) > 0) { ny -= over; touching = true; }
            if ((over = -72 - qy) > 0) { ny += over; touching = true; }
          }
        }
        if (touching) {
          double pushing = 0; for (double pw : power) pushing += Math.abs(pw);
          if (pushing > 0.2) { double snap = Math.round(h / 90.0) * 90.0; nh = h + Math.max(-60 * dt, Math.min(60 * dt, (snap - h) * 15 * dt)); }
          double bvf = ((nx - x) * Math.cos(hr) + (ny - y) * Math.sin(hr)) / dt;
          double bvs = ((nx - x) * Math.sin(hr) - (ny - y) * Math.cos(hr)) / dt;
          if (Math.abs(bvf) < Math.abs(vf)) vf = bvf;
          if (Math.abs(bvs) < Math.abs(vs)) vs = bvs;
          om = (nh - h) / dt;
        }
      }
      x = nx; y = ny; h = nh;
      volts += ((13.0 - 1.1 * pSum / 4 - 0.01 * clock) - volts) * Math.min(1, dt / 0.2);
    }

    double encOut(int i, double e) { return (motorFlip[i] ? -e : e) * (encFlip[i] ? -1 : 1); }

    int read(int i) {
      reads++;
      if (hub.getBulkCachingMode() == LynxModule.BulkCachingMode.OFF) {
        advance(READ_MS);
        return (int) Math.round(encOut(i, enc[i]));
      }
      if (!valid[i]) {
        advance(BULK_MS);
        for (int j = 0; j < 4; j++) { cached[j] = enc[j]; valid[j] = true; }
      }
      valid[i] = false;
      return (int) Math.round(encOut(i, cached[i]));
    }
  }

  static class M implements DcMotorEx {
    final Sim s; final int i;
    M(Sim s, int i) { this.s = s; this.i = i; }
    public void setDirection(Direction d) {}
    public void setPower(double p) { s.writes++; s.advance(WRITE_MS); s.power[i] = Math.max(-1, Math.min(1, p)); }
    public double getPower() { return s.power[i]; }
    public void setMode(RunMode m) { s.advance(WRITE_MS); s.openLoop[i] = m == RunMode.RUN_WITHOUT_ENCODER; }
    public void setZeroPowerBehavior(ZeroPowerBehavior z) {}
    public int getCurrentPosition() { return s.read(i); }
  }
  static class Imu implements IMU {
    final Sim s; double zero;
    Imu(Sim s) { this.s = s; }
    public boolean initialize(Parameters p) { return true; }
    public void resetYaw() { zero = s.h; }
    public YawPitchRollAngles getRobotYawPitchRollAngles() {
      s.advance(IMU_MS);
      return new YawPitchRollAngles(wrap(s.h - zero + 0.02 * s.rnd.nextGaussian()));
    }
  }
  static class Volt implements VoltageSensor {
    final Sim s; Volt(Sim s) { this.s = s; }
    public double getVoltage() { s.advance(VOLT_MS); return s.volts; }
  }

  static double wrap(double d) { d %= 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; }

  static boolean has(Object o, String m) { for (Method x : o.getClass().getMethods()) if (x.getName().equals(m)) return true; return false; }
  static Object call(Object o, String m, Object... args) {
    try { for (Method x : o.getClass().getMethods()) if (x.getName().equals(m) && x.getParameterCount() == args.length) return x.invoke(o, args); }
    catch (Exception e) { throw new RuntimeException(e); }
    return null;
  }
  static void set(Object o, String f, Object v) {
    try { Field x = o.getClass().getField(f); x.set(o, v); } catch (NoSuchFieldException e) { } catch (Exception e) { throw new RuntimeException(e); }
  }

  static int LIFT = -1;

  static class Result { double endErr, estErr, time, loopMs; int slips; }

  interface Course { void build(OverPath r); double[] end(); }

  static final Course MIXED = new Course() {
    public void build(OverPath r) {
      r.setStartPose(-36, -36, 0);
      r.driveTo(24, -36, 0.9).turnTo(90, 0.6).driveTo(24, 24, 0.9).driveTo(-24, 24, 0.8).turnTo(180, 0.6).driveTo(-24, -12, 0.8);
    }
    public double[] end() { return new double[] {-24, -12}; }
  };
  static final Course STRAFE_PATCH = new Course() {
    public void build(OverPath r) {
      r.setStartPose(-40, 0, 90);
      r.driveTo(40, 0, 0.9);
    }
    public double[] end() { return new double[] {40, 0}; }
  };

  static Result run(Course c, long seed, boolean bulk, double[][] patch, Map<String, Object> tun) {
    OverPath.Constants k = new OverPath.Constants(537.7, 1.0, 3.78, 1.1);
    ElapsedTime.fakeNanos = 0;
    Sim s = new Sim(seed, k.ticksPerInch(), 0, 0, 0);
    s.patches = patch;
    s.lifted = LIFT;
    if (patch != null) s.strafeEff = 1;
    M lf = new M(s, 0), rf = new M(s, 1), lb = new M(s, 2), rb = new M(s, 3);
    Imu imu = new Imu(s);
    OverPath r = new OverPath(OverPath.Drive.MECANUM, lf, rf, lb, rb, imu, k);
    c.build(r);
    s.x = r.getX(); s.y = r.getY(); s.h = r.getHeading(); imu.zero = s.h;
    if (bulk && has(r, "useHardwareMap")) {
      HardwareMap hw = new HardwareMap();
      hw.devices.put("hub", s.hub);
      hw.devices.put("battery", new Volt(s));
      call(r, "useHardwareMap", hw);
    }
    if (tun != null) for (Map.Entry<String, Object> e : tun.entrySet()) set(r, e.getKey(), e.getValue());
    int loops = 0;
    while (r.isBusy() && s.clock < 30) {
      r.update();
      s.advance(3 + 4 * s.rnd.nextDouble());
      loops++;
    }
    Result out = new Result();
    out.time = s.clock;
    out.loopMs = s.clock * 1000 / Math.max(1, loops);
    r.stop();
    for (int i = 0; i < 100; i++) { s.advance(10); r.update(); }
    double[] e = c.end();
    out.endErr = Math.hypot(s.x - e[0], s.y - e[1]);
    out.estErr = Math.hypot(r.getX() - s.x, r.getY() - s.y);
    out.slips = has(r, "slipCount") ? (Integer) call(r, "slipCount") : 0;
    return out;
  }

  static double mean(List<Double> v) { double s = 0; for (double d : v) s += d; return s / v.size(); }
  static double p95(List<Double> v) { List<Double> c = new ArrayList<Double>(v); Collections.sort(c); return c.get(Math.min(c.size() - 1, (int) Math.floor(0.95 * c.size()))); }

  static double[] batch(String label, Course c, int n, boolean bulk, double[][] patch, Map<String, Object> tun) {
    List<Double> end = new ArrayList<Double>(), est = new ArrayList<Double>(), time = new ArrayList<Double>(), loop = new ArrayList<Double>();
    int slips = 0;
    for (int i = 0; i < n; i++) {
      Result r = run(c, 1000 + i, bulk, patch, tun);
      end.add(r.endErr); est.add(r.estErr); time.add(r.time); loop.add(r.loopMs); slips += r.slips;
    }
    System.out.printf(Locale.US, "%-34s end err %5.2f (p95 %5.2f) in | est err %5.2f (p95 %5.2f) in | %5.2f s | loop %4.1f ms | slips/run %4.1f%n",
        label, mean(end), p95(end), mean(est), p95(est), mean(time), mean(loop), slips / (double) n);
    return new double[] {mean(end), mean(est), mean(time), mean(loop), slips / (double) n, p95(end)};
  }

  static int fails = 0;
  static void check(String what, boolean ok, String detail) {
    if (!ok) fails++;
    System.out.printf("%s %-60s %s%n", ok ? "PASS" : "FAIL", what, detail);
  }

  public static void main(String[] args) {
    String v = args.length > 0 ? args[0] : "v3";
    int n = 30;
    double[][] patch = {{-60, -41, -30, 30, 0.3}, {41, 60, -30, 30, 0.3}};
    System.out.println("--- " + v);
    double[] mixed = batch(v + " mixed course", MIXED, n, true, null, null);
    double[] slick = batch(v + " strafe, slick launch + brake", STRAFE_PATCH, n, true, patch, null);
    LIFT = 0;
    double[] lift = batch(v + " mixed, left-front wheel lifted", MIXED, n, true, null, null);
    LIFT = -1;
    System.out.printf(Locale.US, "AB %s mixed %.3f %.3f %.3f %.3f | slick %.3f %.3f %.3f | lifted %.3f %.3f %.3f%n", v,
        mixed[0], mixed[1], mixed[2], mixed[3], slick[0], slick[1], slick[2], lift[0], lift[1], lift[2]);
    if (!v.equals("v3")) return;

    Map<String, Object> noSlew = new HashMap<String, Object>();
    noSlew.put("maxPowerRatePerS", 0.0);
    Map<String, Object> hardStop = new HashMap<String, Object>();
    hardStop.put("maxPowerDropPerS", 0.0);
    double[] noBulk = batch("v3 mixed, no bulk reads", MIXED, n, false, null, null);
    LIFT = 0;
    Map<String, Object> slipFix = new HashMap<String, Object>();
    slipFix.put("slipCorrection", true);
    double[] liftFix = batch("v3 lifted wheel, slipCorrection on", MIXED, n, true, null, slipFix);
    LIFT = -1;
    double[] mixedNoSlew = batch("v3 mixed, no traction limit", MIXED, n, true, null, noSlew);
    double[] slickHard = batch("v3 slick, hard stops", STRAFE_PATCH, n, true, patch, hardStop);

    check("bulk reads make the loop faster (>= 30 %)", mixed[3] <= 0.7 * noBulk[3],
        String.format(Locale.US, "%.1f ms vs %.1f ms", mixed[3], noBulk[3]));
    check("no false slip alarms at full grip", mixed[4] < 0.5, String.format(Locale.US, "%.2f slips/run", mixed[4]));
    check("a lifted wheel is caught", lift[4] >= 1, String.format(Locale.US, "%.1f slips/run", lift[4]));
    System.out.printf(Locale.US, "INFO experimental slipCorrection with a lifted wheel: %.2f in (default: %.2f in)%n", liftFix[1], lift[1]);
    check("soft stops halve the estimate error on slick tiles", slick[1] <= 0.5 * slickHard[1],
        String.format(Locale.US, "%.2f in vs %.2f in", slick[1], slickHard[1]));
    check("traction limit keeps the estimate at least as good", mixed[1] <= mixedNoSlew[1] + 0.05,
        String.format(Locale.US, "%.2f in vs %.2f in", mixed[1], mixedNoSlew[1]));
    System.out.println(fails == 0 ? "ALL PASS" : fails + " FAILED");
  }
}
