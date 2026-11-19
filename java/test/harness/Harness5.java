import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.util.ElapsedTime;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.teamcode.overpath.OverPath;
import org.firstinspires.ftc.teamcode.overpath.OverPathAutoTune;

import java.io.File;
import java.nio.file.Files;
import java.util.*;

public class Harness5 {
  static final OverPath.Constants K = new OverPath.Constants(537.7, 1.0, 3.78, 1.1);
  static final Telemetry NOOP = new Telemetry() {
    public Object addData(String c, String f, Object... a) { return null; } public Object addData(String c, Object v) { return null; }
    public Object addLine(String l) { return null; } public boolean update() { return true; } };

  static Harness4.Sim sim(long seed, double x, double y, double h) {
    ElapsedTime.fakeNanos = 0;
    Harness4.Sim s = new Harness4.Sim(seed, K.ticksPerInch(), x, y, h);
    s.strafeEff = 1;
    return s;
  }
  static OverPathAutoTune tuner(Harness4.Sim s, double budgetS) {
    Harness4.M lf = new Harness4.M(s, 0), rf = new Harness4.M(s, 1), lb = new Harness4.M(s, 2), rb = new Harness4.M(s, 3);
    Harness4.Imu imu = new Harness4.Imu(s);
    imu.zero = s.h;
    HardwareMap hw = new HardwareMap();
    hw.devices.put("hub", s.hub);
    final double end = s.clock + budgetS;
    return new OverPathAutoTune(OverPath.Drive.MECANUM, lf, rf, lb, rb, imu, K, hw, NOOP, () -> s.clock < end,
        new String[] {"frontLeftMotor", "frontRightMotor", "backLeftMotor", "backRightMotor"});
  }

  static int fails = 0;
  static void check(String what, double got, double want, double tol) {
    boolean ok = Math.abs(got - want) <= tol;
    if (!ok) fails++;
    System.out.printf(Locale.US, "%s %-58s got %9.4f want %9.4f (±%.4f)%n", ok ? "PASS" : "FAIL", what, got, want, tol);
  }
  static void check(String what, boolean ok, String detail) {
    if (!ok) fails++;
    System.out.printf(Locale.US, "%s %-58s %s%n", ok ? "PASS" : "FAIL", what, detail);
  }

  static double trueRoll(double power) {
    Harness4.Sim s = sim(7, 0, 0, 0);
    double mag = 0;
    for (int i = 0; i < 2000; i++) { mag = Math.min(power, mag + 0.02); for (int w = 0; w < 4; w++) s.power[w] = mag; s.advance(10); }
    double v = s.vf, x0 = s.x;
    while (mag > 0) { mag = Math.max(0, mag - 0.04); for (int w = 0; w < 4; w++) s.power[w] = mag; s.advance(10); }
    for (int i = 0; i < 200; i++) s.advance(10);
    System.out.printf(Locale.US, "  truth: at %.1f in/s it rolls %.2f in%n", v, s.x - x0);
    return (s.x - x0) / v;
  }

  public static void main(String[] args) throws Exception {
    File dir = Files.createTempDirectory("overpath").toFile();
    OverPath.filesDir = dir.getPath();

    {
      Harness4.Sim s = sim(1, 0, 0, 90);
      s.motorFlip[1] = true;
      s.encFlip[2] = true;
      OverPathAutoTune t = tuner(s, 60);
      t.directions();
      System.out.println("  report: " + t.report);
      check("1 front-left OK", t.report.get(0).endsWith("OK"), t.report.get(0));
      check("1 front-right spins backwards", t.report.get(1).contains("BACKWARDS"), t.report.get(1));
      check("1 back-left encoder counts backwards", t.report.get(2).contains("encoder counts backwards"), t.report.get(2));
      check("1 back-right OK", t.report.get(3).endsWith("OK"), t.report.get(3));
    }
    {
      Harness4.Sim s = sim(2, 0, 0, 0);
      s.deadband = 0.08;
      OverPathAutoTune t = tuner(s, 60);
      t.minPower();
      check("2 min power (deadband 0.08; errs high = safe)", t.minPower, (0.08 + 1.5 / 46) * 1.15, 0.04);
      check("2 turn min power", t.turnMinPower, (0.08 + 1.5 / 46) * 1.15, 0.04);
    }
    {
      Harness4.Sim s = sim(3, 0, 0, 0);
      OverPathAutoTune t = tuner(s, 120);
      boolean ok = t.speedAndBraking();
      check("3 speed + braking finished", ok, "");
      check("3 max speed at power 1 (harness: 46 in/s)", t.maxSpeedInPerSec, 46, 4.6);
      double perV = trueRoll(0.7);
      double v = 0.7 * 46;
      double predicted = t.brakeLinear * v + t.brakeQuadratic * v * v;
      check("3 predicted roll at 32 in/s vs measured (in)", predicted, perV * v, 0.15 * perV * v + 0.1);
      System.out.printf(Locale.US, "  fit: brakeLinear %.4f brakeQuadratic %.6f%n", t.brakeLinear, t.brakeQuadratic);
    }
    {
      Harness4.Sim s = sim(4, 0, 0, 0);
      OverPathAutoTune t = tuner(s, 60);
      t.turnRadius();
      check("4 turn radius (harness: 8 in)", t.turnRadiusIn, 8, 0.8);
    }
    {
      Harness4.Sim s = sim(5, 0, -72 + 9 + 3, 90);
      s.walls = true;
      s.patches = new double[][] {{-80, 80, -80, 80, 0.4}};
      OverPathAutoTune t = tuner(s, 400);
      t.rampIn = 0;
      t.squarePower = 0.12;
      boolean ok = t.gripLimits();
      check("5 grip test finished", ok, "" + t.report);
      check("5 slippery floor: a rise limit is found (<= 4 /s)", t.maxPowerRatePerS <= 4, "got " + t.maxPowerRatePerS);
      check("5 slippery floor: a drop limit is found (<= 4 /s)", t.maxPowerDropPerS <= 4, "got " + t.maxPowerDropPerS);
    }
    {
      Harness4.Sim s = sim(5, 0, -72 + 9 + 3, 90);
      s.walls = true;
      s.patches = new double[][] {{-80, 80, -80, 80, 0.4}};
      OverPathAutoTune t = tuner(s, 400);
      boolean ok = t.gripLimits();
      check("5a spinning at the wall is reported, nothing guessed", !ok && Double.isNaN(t.maxPowerRatePerS) && t.report.toString().contains("spin at the wall"), "" + t.report);
    }
    {
      Harness4.Sim s = sim(5, 0, -72 + 9 + 3, 90);
      s.walls = true;
      OverPathAutoTune t = tuner(s, 400);
      t.gripLimits();
      check("5b normal tiles + 6 in ramp: no harmful slip (limits >= 6 /s)", t.maxPowerRatePerS >= 6 && t.maxPowerDropPerS >= 6,
          "rise " + t.maxPowerRatePerS + " drop " + t.maxPowerDropPerS);
    }
    {
      Harness4.Sim s = sim(6, 0, -72 + 9 + 3, 90);
      s.walls = true;
      s.encNoise = 0.02;
      OverPathAutoTune t = tuner(s, 400);
      boolean ok = t.wallTrips(false, 10);
      check("6 forward wall trips finished (>= 8 clean touches)", ok && t.forwardTrips.size() >= 8, "trips " + t.forwardTrips.size());
      System.out.println("  corrections (in): " + t.forwardTrips);
      check("6 drive error from the wall (truth 2 %)", t.alongPct, 0.02, 0.008);
      check("6 robot ended flush against the rear wall (heading)", Harness4.wrap(s.h - 90), 0, 1.0);
    }
    {
      Harness4.Sim s = sim(7, 0, -72 + 9 + 3, 0);
      s.walls = true;
      s.encNoise = 0.02;
      OverPathAutoTune t = tuner(s, 400);
      boolean ok = t.wallTrips(true, 10);
      check("6b strafe wall trips finished (>= 8 clean touches)", ok && t.strafeTrips.size() >= 8, "trips " + t.strafeTrips.size());
      System.out.println("  corrections (in): " + t.strafeTrips);
      check("6b strafe error from the wall (truth 2 %)", t.strafePct, 0.02, 0.008);
    }
    {
      Harness4.Sim s = sim(8, 0, 0, 0);
      OverPathAutoTune t = tuner(s, 60);
      t.turnRadius();
      check("7 saved calibration.json", t.save("home") && new File(dir, "calibration.json").isFile(), dir.getPath());
      String json = new String(Files.readAllBytes(new File(dir, "calibration.json").toPath()), "UTF-8");
      check("7 json has the turn radius", json.contains("\"turnRadiusIn\""), "");
      OverPathAutoTune.FileServer srv = new OverPathAutoTune.FileServer(10159);
      try {
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL("http://127.0.0.1:10159/calibration.json").openConnection();
        String body = new String(readAll(c.getInputStream()), "UTF-8");
        check("7 server serves calibration.json with CORS", c.getResponseCode() == 200 && "*".equals(c.getHeaderField("Access-Control-Allow-Origin")) && body.equals(json), "code " + c.getResponseCode());
        java.net.HttpURLConnection l = (java.net.HttpURLConnection) new java.net.URL("http://127.0.0.1:10159/list.json").openConnection();
        check("7 list.json lists it", new String(readAll(l.getInputStream()), "UTF-8").contains("calibration.json"), "");
        java.net.HttpURLConnection bad = (java.net.HttpURLConnection) new java.net.URL("http://127.0.0.1:10159/..%2F..%2Fetc%2Fpasswd").openConnection();
        check("7 no path tricks", bad.getResponseCode() == 404, "code " + bad.getResponseCode());
      } finally {
        srv.close();
      }
      System.out.println(json);
    }
    System.out.println(fails == 0 ? "ALL PASS" : fails + " FAILED");
  }

  static byte[] readAll(java.io.InputStream in) throws java.io.IOException {
    java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream(); byte[] b = new byte[4096]; int n;
    while ((n = in.read(b)) > 0) o.write(b, 0, n);
    return o.toByteArray();
  }
}
