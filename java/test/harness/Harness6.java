import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.util.ElapsedTime;
import org.firstinspires.ftc.teamcode.overpath.OverPath;

import java.io.File;
import java.nio.file.Files;
import java.util.*;

public class Harness6 {
  static int fails = 0;
  static void check(String what, boolean ok, String detail) {
    if (!ok) fails++;
    System.out.printf(Locale.US, "%s %-62s %s%n", ok ? "PASS" : "FAIL", what, detail);
  }

  public static void main(String[] args) throws Exception {
    File dir = Files.createTempDirectory("overpath-runs").toFile();
    OverPath.filesDir = dir.getPath();
    OverPath.Constants k = new OverPath.Constants(537.7, 1.0, 3.78, 1.1);
    ElapsedTime.fakeNanos = 0;
    Harness4.Sim s = new Harness4.Sim(11, k.ticksPerInch(), -36.6, -60, 90);
    s.walls = true;
    s.strafeEff = 1;
    s.encScale = 1.03;
    Harness4.M lf = new Harness4.M(s, 0), rf = new Harness4.M(s, 1), lb = new Harness4.M(s, 2), rb = new Harness4.M(s, 3);
    Harness4.Imu imu = new Harness4.Imu(s);
    imu.zero = 90;
    HardwareMap hw = new HardwareMap();
    hw.devices.put("hub", s.hub);
    OverPath r = new OverPath(OverPath.Drive.MECANUM, lf, rf, lb, rb, imu, k).useHardwareMap(hw).log("BlueLeft");
    r.setStartPose(-36, -60, 90);
    r.driveTo(-36, -24, 0.7).driveTo(-50, -24, 0.6).squareToWall(OverPath.Wall.LEFT, OverPath.Face.LEFT, 0.3)
        .driveTo(-48, -40, 0.6).squareToWall(OverPath.Wall.REAR, OverPath.Face.BACK, 0.3).driveTo(-30, -40, 0.6);
    final List<double[]> truth = new ArrayList<>();
    boolean wasTouching = false;
    while (r.isBusy() && s.clock < 30) {
      r.update();
      s.advance(3 + 4 * s.rnd.nextDouble());
      if (s.touching && !wasTouching) truth.add(new double[] {r.getX() - s.x, r.getY() - s.y});
      wasTouching = s.touching;
    }
    r.stop();
    check("a run log was written", r.logFile() != null && new File(r.logFile()).isFile(), String.valueOf(r.logFile()));
    if (args.length > 0) Files.copy(new File(r.logFile()).toPath(), new File(args[0]).toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    List<String> lines = Files.readAllLines(new File(r.logFile()).toPath());
    check("header has the constants used", lines.stream().anyMatch(l -> l.startsWith("# constants ") && l.contains("wheelDiameterIn=3.78")), "");
    long samples = lines.stream().filter(l -> l.startsWith("S,")).count();
    check("one sample per loop (hundreds)", samples > 300, samples + " samples");
    List<String> walls = new ArrayList<>();
    for (String l : lines) if (l.startsWith("E,") && l.split(",")[3].equals("wall")) walls.add(l);
    check("two wall touches logged", walls.size() == 2, walls.toString());
    check("steps logged", lines.stream().filter(l -> l.startsWith("E,") && l.split(",")[3].equals("step")).count() == 6, "");
    if (walls.size() == 2) {
      String[] w = walls.get(0).split(",");
      double corr = Double.parseDouble(w[6]);
      double fSigned = Double.parseDouble(w[8]);
      double sSigned = Double.parseDouble(w[9]);
      System.out.println("  left wall event: " + walls.get(0));
      double trueCorr = truth.isEmpty() ? Double.NaN : truth.get(0)[0];
      check("wall correction = the robot's real error (within 0.3 in)", Math.abs(corr - trueCorr) < 0.3,
          String.format(Locale.US, "logged %.2f, true %.2f", corr, trueCorr));
      check("travel toward the left wall was mostly strafing", Math.abs(sSigned) > 10 && Math.abs(fSigned) < 2,
          String.format(Locale.US, "forward %.2f strafe %.2f", fSigned, sSigned));
    }
    OverPath.keepRuns = 3;
    for (int i = 0; i < 5; i++) {
      ElapsedTime.fakeNanos = 0;
      Harness4.Sim s2 = new Harness4.Sim(20 + i, k.ticksPerInch(), 0, 0, 0);
      OverPath q = new OverPath(OverPath.Drive.MECANUM, new Harness4.M(s2, 0), new Harness4.M(s2, 1), new Harness4.M(s2, 2), new Harness4.M(s2, 3), new Harness4.Imu(s2), k).log("x" + i);
      q.driveTo(6, 0, 0.5);
      while (q.isBusy() && s2.clock < 10) { q.update(); s2.advance(5); }

      Thread.sleep(1100);
    }
    File[] runs = dir.listFiles((d, n) -> n.startsWith("run-"));
    check("keeps the newest 3 run logs", runs != null && runs.length == 3, Arrays.toString(runs));
    System.out.println(fails == 0 ? "ALL PASS" : fails + " FAILED");
  }
}
