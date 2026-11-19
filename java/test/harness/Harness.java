import com.qualcomm.robotcore.hardware.*;
import com.qualcomm.robotcore.util.ElapsedTime;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;
import org.firstinspires.ftc.teamcode.overpath.OverPath;

public class Harness {
  static class M implements DcMotorEx {
    double power, pos;
    public void setDirection(Direction d) {} public void setPower(double p) { power = p; } public double getPower() { return power; }
    public void setMode(RunMode m) {} public void setZeroPowerBehavior(ZeroPowerBehavior z) {}
    public int getCurrentPosition() { return (int) Math.round(pos); }
  }
  static class Imu implements IMU {
    double yaw;
    public boolean initialize(Parameters p) { return true; } public void resetYaw() { yaw = 0; }
    public YawPitchRollAngles getRobotYawPitchRollAngles() { return new YawPitchRollAngles(yaw); }
  }
  static class Robot {
    final boolean mecanum; final M lf = new M(), rf = new M(), lb = new M(), rb = new M(); final Imu imu = new Imu();
    double x, y, h;
    boolean twoMotor;
    final double tpi, strafeMult, maxIps = 45, trackR = 8;
    Robot(boolean mecanum, double h0, double tpi, double strafeMult) { this.mecanum = mecanum; this.h = h0; this.tpi = tpi; this.strafeMult = strafeMult; }
    void step(double dt) {
      double a = lf.power * maxIps, b = rf.power * maxIps, c = lb.power * maxIps, d = rb.power * maxIps;
      if (twoMotor) { c = a; d = b; }
      M[] ms = {lf, rf, lb, rb}; double[] v = {a, b, c, d};
      for (int i = 0; i < 4; i++) ms[i].pos += v[i] * dt * tpi;
      double fwd = (a + b + c + d) / 4;
      double right = mecanum ? (a - b - c + d) / 4 / strafeMult : 0;
      double ccw = (-a + b - c + d) / 4;
      double hr = Math.toRadians(h);
      x += (fwd * Math.cos(hr) + right * Math.sin(hr)) * dt;
      y += (fwd * Math.sin(hr) - right * Math.cos(hr)) * dt;
      h += Math.toDegrees(ccw / trackR * dt);
      imu.yaw += Math.toDegrees(ccw / trackR * dt);
    }
  }
  static final Telemetry NOOP = new Telemetry() {
    public Object addData(String c, String f, Object... a) { return null; } public Object addData(String c, Object v) { return null; }
    public Object addLine(String l) { return null; } public boolean update() { return true; } };

  static int fails = 0;
  static void check(String what, double got, double want, double tol) {
    boolean ok = Math.abs(got - want) <= tol;
    if (!ok) fails++;
    System.out.printf("%s %-34s got %8.2f want %8.2f%n", ok ? "PASS" : "FAIL", what, got, want);
  }
  static void run(OverPath r, Robot bot) {
    ElapsedTime.fakeNanos = 0;
    for (int i = 0; i < 60000 && r.isBusy(); i++) { r.update(); r.addTelemetry(NOOP); bot.step(0.01); ElapsedTime.fakeNanos += 10_000_000L; }
    r.stop();
  }

  public static void main(String[] args) {
    OverPath.Constants k = new OverPath.Constants(537.7, 1.0, 3.78, 1.1);
    double tpi = k.ticksPerInch();

    Robot m = new Robot(true, 90, tpi, 1.1);
    final int[] fired = {0};
    OverPath r = new OverPath(OverPath.Drive.MECANUM, m.lf, m.rf, m.lb, m.rb, m.imu, k);
    r.setStartHeading(90);
    r.registerCommand("hit", () -> fired[0]++);
    r.drive(24, 0.7).marker(0.5, "hit").strafe(12, 0.5).turnTo(0, 0.5).driveVector(10, -10, 0.5).turnBy(-90, 0.5).waitMs(200);
    run(r, m);
    check("mecanum x", m.x, 22, 1.0);
    check("mecanum y", m.y, 34, 1.0);
    check("mecanum heading", m.h, -90, 2.0);
    check("runner heading == robot heading", r.getHeading(), m.h, 0.01);
    check("marker fired once", fired[0], 1, 0);

    Robot t = new Robot(false, 0, tpi, 1.1);
    t.twoMotor = true;
    OverPath tr = new OverPath(OverPath.Drive.TANK, t.lf, t.rf, null, null, t.imu, k);
    tr.setStartHeading(0);
    tr.turnTo(90, 0.5).drive(24, 0.6).turnTo(180, 0.5).drive(-12, 0.6);
    run(tr, t);
    check("tank x", t.x, 12, 1.0);
    check("tank y", t.y, 24, 1.0);
    check("tank |heading| ~ 180", Math.abs(OverPath.wrap(t.h)), 180, 2.0);

    Robot stuck = new Robot(true, 0, tpi, 1.1);
    OverPath sr = new OverPath(OverPath.Drive.MECANUM, stuck.lf, stuck.rf, stuck.lb, stuck.rb, stuck.imu, k) {};
    sr.drive(24, 0.5).timeout(1500).waitMs(100);
    ElapsedTime.fakeNanos = 0;
    int loops = 0;
    while (sr.isBusy() && loops < 10000) { sr.update(); ElapsedTime.fakeNanos += 10_000_000L; loops++; }
    check("stuck drive ends via stall detection, before the 1.5 s timeout (s)", loops * 0.01, 0.45, 0.2);

    boolean threw = false;
    try { new OverPath(OverPath.Drive.TANK, t.lf, t.rf, null, null, t.imu, k).strafe(5, 0.5); } catch (IllegalStateException e) { threw = true; }
    check("tank strafe throws", threw ? 1 : 0, 1, 0);

    Robot pm = new Robot(true, 90, tpi, 1.1);
    final M intake = new M();
    final double[] shootStart = {-1}, shootStop = {-1}, intakeOff = {-1};
    OverPath pr = new OverPath(OverPath.Drive.MECANUM, pm.lf, pm.rf, pm.lb, pm.rb, pm.imu, k);
    pr.setStartHeading(90);
    pr.registerCommand("shoot", () -> shootStart[0] = ElapsedTime.fakeNanos / 1e9, () -> shootStop[0] = ElapsedTime.fakeNanos / 1e9);
    pr.commandFor("shoot", 1500).startMotorFor(intake, 1.0, 2000).drive(24, 0.6);
    ElapsedTime.fakeNanos = 0;
    double driveStart = -1, seqDone = -1, intakeOn = -1;
    for (int i = 0; i < 60000 && pr.isBusy(); i++) {
      pr.update(); pr.addTelemetry(NOOP);
      double now = ElapsedTime.fakeNanos / 1e9;
      if (driveStart < 0 && pm.lf.power != 0) driveStart = now;
      if (intakeOn < 0 && intake.power != 0) intakeOn = now;
      if (intakeOn >= 0 && intakeOff[0] < 0 && intake.power == 0) intakeOff[0] = now;
      if (seqDone < 0 && pr.currentStepIndex() >= pr.stepCount()) seqDone = now;
      pm.step(0.01); ElapsedTime.fakeNanos += 10_000_000L;
    }
    check("shoot starts at 0 s", shootStart[0], 0, 0.02);
    check("shoot stops at 1.5 s", shootStop[0], 1.5, 0.03);
    check("drive starts right after shooting", driveStart, 1.5, 0.05);
    check("intake starts when shooting ends", intakeOn, 1.5, 0.03);
    check("intake stops 2 s after it started", intakeOff[0] - intakeOn, 2.0, 0.03);
    check("drive finished before intake (bg kept going)", seqDone < intakeOff[0] ? 1 : 0, 1, 0);
    check("drove 24 in while intake ran", pm.y, 24, 1.0);
    final M spin = new M();
    OverPath sr2 = new OverPath(OverPath.Drive.MECANUM, pm.lf, pm.rf, pm.lb, pm.rb, pm.imu, k);
    sr2.startMotorFor(spin, 0.7, 5000);
    ElapsedTime.fakeNanos = 0; sr2.update();
    double running = spin.power; sr2.stop();
    check("stop() ends background motor", running == 0.7 && spin.power == 0 ? 1 : 0, 1, 0);

    System.out.println(fails == 0 ? "ALL PASS" : fails + " FAILED");
    System.exit(fails == 0 ? 0 : 1);
  }
}
