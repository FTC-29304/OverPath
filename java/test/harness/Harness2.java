import com.qualcomm.robotcore.hardware.*;
import com.qualcomm.robotcore.util.ElapsedTime;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;
import org.firstinspires.ftc.teamcode.overpath.OverPath;

public class Harness2 {
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
      for (int i = 0; i < 4; i++) w[i].pos += (bvf + STRAFE[i] * bvs * (mecanum ? strafeMult : 0) + TURN[i] * bom * R) * dt * tpi;
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

    {
      Robot b = new Robot(true, 0, 0, 90, tpi, 1.1);
      OverPath r = mk(b, k);
      r.turnTolDeg = 3.0;
      r.setStartPose(0, 0, 90);
      r.driveTo(0, 24, 0.8).turnTo(0, 0.6).driveTo(48, 24, 0.8).driveTo(48, -12, 0.8);
      run(r, b, null);
      check("1 driveTo end x (coast + 3° turn tolerance)", b.x, 48, 0.6);
      check("1 driveTo end y", b.y, -12, 0.6);
      check("1 tracked pose matches the real robot (x)", r.getX(), b.x, 0.6);
    }
    {
      Robot b = new Robot(true, 0, 0, 90, tpi, 1.1);
      OverPath r = mk(b, k);
      r.setStartHeading(90);
      r.drive(24, 0.7).strafe(12, 0.5).turnTo(0, 0.5).driveVector(10, -10, 0.5);
      run(r, b, null);
      check("1b old relative calls: x", b.x, 22, 0.6);
      check("1b old relative calls: y", b.y, 34, 0.6);
    }
    {
      Robot b = new Robot(true, -50, 0, 183, tpi, 1.1);
      OverPath r = mk(b, k);
      r.setStartPose(-47, 0, 180);
      r.squareToWall(OverPath.Wall.LEFT, OverPath.Face.FRONT, 0.3);
      run(r, b, null);
      check("2 wall square: front face ended 1 in back-off from the wall (+coast)", b.x - 9, -70.75, 1.25);
      check("2 wall square: x estimate error after re-zero", r.getX() - b.x, 0, 0.3);
      check("2 wall square: heading estimate error", wrap(r.getHeading() - b.h), 0, 1.0);
      check("2 wall square: real heading flush to wall", wrap(b.h - 180), 0, 1.0);
    }
    {
      Robot b = new Robot(true, 0, 0, 0, tpi, 1.1);
      b.box = new double[] {12, 30, -20, 20};
      OverPath r = mk(b, k);
      r.setStartPose(0, 0, 0);
      r.driveTo(40, 0, 0.6).turnTo(90, 0.5);
      final double[] contact = {-1}, skipped = {-1};
      run(r, b, (t, bb, rr) -> {
        if (contact[0] < 0 && bb.x > 11.0) contact[0] = t;
        if (skipped[0] < 0 && rr.currentStepIndex() >= 1) skipped[0] = t;
      });
      check("3 blocked detected", r.blockedCount(), 1, 0);
      check("3 skipped soon after contact (s)", skipped[0] - contact[0], 0.45, 0.25);
      check("3 next step (turn to 90) still ran", wrap(b.h - 90), 0, 3.0);
    }
    {
      Robot b = new Robot(true, 0, 0, 0, tpi, 1.1);
      OverPath r = mk(b, k);
      r.setStartPose(0, 0, 0);
      r.turnTo(90, 0.5).waitMs(200).turnTo(-90, 0.5).turnTo(170, 0.5);
      run(r, b, (t, bb, rr) -> { if (!bb.imu.frozen && Math.abs(wrap(bb.h + 90)) < 40 && t > 1.0) bb.imu.freeze(); });
      check("4 IMU failure detected", r.isImuOk() ? 0 : 1, 1, 0);
      check("4 final heading still near 170 (wheel heading)", wrap(b.h - 170), 0, 5.0);
    }
    {
      Robot b = new Robot(false, 0, 0, 0, tpi, 1.1);
      OverPath r = mk(b, k);
      r.setStartPose(0, 0, 0);
      r.driveTo(24, 24, 0.6).driveTo(0, 24, 0.6).reversed();
      run(r, b, null);
      check("5 tank end x", b.x, 0, 0.8);
      check("5 tank end y", b.y, 24, 0.8);
      check("5 tank drove backwards (still facing ~+X/-X axis)", Math.abs(Math.abs(wrap(b.h)) - 0) < 30 || Math.abs(Math.abs(wrap(b.h)) - 180) < 30 ? 1 : 0, 1, 0);
    }
    System.out.println(fails == 0 ? "ALL PASS" : fails + " FAILED");
    System.exit(fails == 0 ? 0 : 1);
  }
}
