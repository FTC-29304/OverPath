import com.qualcomm.robotcore.hardware.*;
import com.qualcomm.robotcore.util.ElapsedTime;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;
import org.firstinspires.ftc.teamcode.overpath.OverPath;

public class Harness3 {
  static class M implements DcMotorEx {
    double power, pos;
    public void setDirection(Direction d) {} public void setPower(double p) { power = p; } public double getPower() { return power; }
    public void setMode(RunMode m) {} public void setZeroPowerBehavior(ZeroPowerBehavior z) {}
    public int getCurrentPosition() { return (int) Math.round(pos); }
  }
  static class Imu implements IMU {
    double yaw; boolean frozen; double frozenAt;
    public boolean initialize(Parameters p) { return true; }
    public void resetYaw() { yaw = 0; }
    public YawPitchRollAngles getRobotYawPitchRollAngles() { return new YawPitchRollAngles(frozen ? frozenAt : yaw); }
    void freeze() { frozen = true; frozenAt = 0; }
  }

  static final double[] STRAFE = {1, -1, -1, 1};
  static final double[] TURN = {-1, 1, -1, 1};

  static class Robot {
    final boolean mecanum;
    final M lf = new M(), rf = new M(), lb = new M(), rb = new M();
    final M[] w = {lf, rf, lb, rb};
    final Imu imu = new Imu();
    double x, y, h;
    double vf, vs, om;
    final double tpi, strafeMult, maxIps = 45, R = 8, tau = 0.12, len = 18, wid = 18;
    double[] box;
    double encScale = 1;
    boolean touching;

    Robot(boolean mecanum, double x, double y, double h, double tpi, double strafeMult) {
      this.mecanum = mecanum; this.x = x; this.y = y; this.h = h; this.tpi = tpi; this.strafeMult = strafeMult;
    }

    double[][] corners(double cx, double cy, double hh) {
      double c = Math.cos(Math.toRadians(hh)), s = Math.sin(Math.toRadians(hh));
      double[][] k = {{len / 2, wid / 2}, {len / 2, -wid / 2}, {-len / 2, -wid / 2}, {-len / 2, wid / 2}};
      double[][] out = new double[4][2];
      for (int i = 0; i < 4; i++) { out[i][0] = cx + k[i][0] * c - k[i][1] * s; out[i][1] = cy + k[i][0] * s + k[i][1] * c; }
      return out;
    }

    void step(double dt) {
      double[] p = new double[4];
      for (int i = 0; i < 4; i++) p[i] = w[i].power * maxIps;
      double dvf = (p[0] + p[1] + p[2] + p[3]) / 4;
      double dvs = mecanum ? (p[0] - p[1] - p[2] + p[3]) / 4 / strafeMult : 0;
      double dom = Math.toDegrees((-p[0] + p[1] - p[2] + p[3]) / 4 / R);
      double a = Math.min(1, dt / tau);
      vf += (dvf - vf) * a; vs += (dvs - vs) * a; om += (dom - om) * a;

      double hr = Math.toRadians(h);
      double nx = x + (vf * Math.cos(hr) + vs * Math.sin(hr)) * dt;
      double ny = y + (vf * Math.sin(hr) - vs * Math.cos(hr)) * dt;
      double nh = h + om * dt;

      touching = false;
      double[][] c = corners(nx, ny, nh);
      double over;
      for (double[] q : c) {
        if ((over = q[0] - 72) > 0) { nx -= over; touching = true; }
        if ((over = -72 - q[0]) > 0) { nx += over; touching = true; }
        if ((over = q[1] - 72) > 0) { ny -= over; touching = true; }
        if ((over = -72 - q[1]) > 0) { ny += over; touching = true; }
        c = corners(nx, ny, nh);
      }
      if (touching && Math.abs(dvf) + Math.abs(dvs) > 1) {
        double snapTo = Math.round(nh / 90.0) * 90.0;
        nh += Math.max(-60 * dt, Math.min(60 * dt, snapTo - nh));
      }
      if (box != null && nx > box[0] && nx < box[1] && ny > box[2] && ny < box[3]) { nx = x; ny = y; }

      double bvf = ((nx - x) * Math.cos(hr) + (ny - y) * Math.sin(hr)) / dt;
      double bvs = ((nx - x) * Math.sin(hr) - (ny - y) * Math.cos(hr)) / dt;
      double bom = Math.toRadians(nh - h) / dt;
      if (bvf * vf < 0 || Math.abs(bvf) < 1e-9) vf = bvf; if (Math.abs(bvs) < Math.abs(vs)) vs = bvs;
      for (int i = 0; i < 4; i++) w[i].pos += (bvf + STRAFE[i] * bvs * (mecanum ? strafeMult : 0) + TURN[i] * bom * R) * dt * tpi * encScale;
      imu.yaw += nh - h;
      x = nx; y = ny; h = nh;
    }
  }

  static final Telemetry NOOP = new Telemetry() {
    public Object addData(String c, String f, Object... a) { return null; } public Object addData(String c, Object v) { return null; }
    public Object addLine(String l) { return null; } public boolean update() { return true; } };

  static int fails = 0;
  static void check(String what, double got, double want, double tol) {
    boolean ok = Math.abs(got - want) <= tol;
    if (!ok) fails++;
    System.out.printf("%s %-52s got %8.2f want %8.2f (±%.2f)%n", ok ? "PASS" : "FAIL", what, got, want, tol);
  }
  static double wrap(double d) { d %= 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; }

  interface Hook { void at(double t, Robot b, OverPath r); }
  static double run(OverPath r, Robot b, Hook hook) {
    ElapsedTime.fakeNanos = 0;
    double t = 0;
    for (int i = 0; i < 60000 && r.isBusy(); i++) {
      r.update(); r.addTelemetry(NOOP); b.step(0.01); t += 0.01; ElapsedTime.fakeNanos += 10_000_000L;
      if (hook != null) hook.at(t, b, r);
    }
    r.stop();
    for (int i = 0; i < 50; i++) { b.step(0.01); ElapsedTime.fakeNanos += 10_000_000L; r.update(); }
    return t;
  }
  static OverPath mk(Robot b, OverPath.Constants k) {
    return b.mecanum ? new OverPath(OverPath.Drive.MECANUM, b.lf, b.rf, b.lb, b.rb, b.imu, k)
                     : new OverPath(OverPath.Drive.TANK, b.lf, b.rf, b.lb, b.rb, b.imu, k);
  }

  public static void main(String[] args) {
    OverPath.Constants k = new OverPath.Constants(537.7, 1.0, 3.78, 1.1);
    double tpi = k.ticksPerInch();
    java.util.Random rnd = new java.util.Random(9483);
    int n = 200;
    double[] xs = new double[n], ys = new double[n];
    for (int run = 0; run < n; run++) {
      Robot b = new Robot(true, -36, -63, 90, tpi, 1.1);
      OverPath r = mk(b, k);
      r.setStartPose(-36, -63, 90);
      r.driveTo(-36, -20, 0.6).turnTo(0, 0.5).driveTo(-36, -19, 0.5).driveTo(10, -19, 0.6);
      final int[] lastStep = {-1};
      b.encScale = 1 + rnd.nextGaussian() * 0.02;
      run(r, b, (t, bb, rr) -> {
        int s = rr.currentStepIndex();
        if (s != lastStep[0]) {
          if (lastStep[0] == 1) bb.imu.yaw += rnd.nextGaussian() * 1.0;
          bb.encScale = 1 + rnd.nextGaussian() * 0.02;
          lastStep[0] = s;
        }
      });
      xs[run] = b.x; ys[run] = b.y;
    }
    System.out.printf("MEASURED sigma x %.3f  sigma y %.3f  (mean end %.2f, %.2f)%n", sd(xs), sd(ys), mean(xs), mean(ys));
  }
  static double mean(double[] a) { double s = 0; for (double v : a) s += v; return s / a.length; }
  static double sd(double[] a) { double m = mean(a), s = 0; for (double v : a) s += (v - m) * (v - m); return Math.sqrt(s / a.length); }
}
