package org.firstinspires.ftc.teamcode.overpath;

import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.hardware.IMU;
import com.qualcomm.robotcore.util.ElapsedTime;

import org.firstinspires.ftc.robotcore.external.Telemetry;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

public final class OverPathAutoTune {
    public interface Running {
        boolean ok();
    }

    private static final double[] STRAFE = {1, -1, -1, 1};
    private static final double[] TURN = {-1, 1, -1, 1};

    public double minPower = Double.NaN;
    public double turnMinPower = Double.NaN;
    public double maxSpeedInPerSec = Double.NaN;
    public double brakeLinear = Double.NaN;
    public double brakeQuadratic = Double.NaN;
    public double turnRadiusIn = Double.NaN;
    public double maxPowerRatePerS = Double.NaN;
    public double maxPowerDropPerS = Double.NaN;
    public double alongPct = Double.NaN;
    public double strafePct = Double.NaN;
    public double turnSigmaDeg = Double.NaN;
    public final List<String> report = new ArrayList<String>();
    public final List<Double> forwardTrips = new ArrayList<Double>();
    public final List<Double> strafeTrips = new ArrayList<Double>();
    public final List<Double> headingTrips = new ArrayList<Double>();

    public double dropRate = 4.0;
    public double rampIn = 6.0;
    public double squarePower = 0.3;
    public double tripIn = 48;
    public double robotLengthIn = 18;
    public double robotWidthIn = 18;

    private final OverPath.Drive drive;
    private final DcMotor[] motors;
    private final IMU imu;
    private final OverPath.Constants k;
    private final HardwareMap hardwareMap;
    private final Telemetry telemetry;
    private final Running running;
    private final String[] names;

    public OverPathAutoTune(OverPath.Drive drive, DcMotor leftFront, DcMotor rightFront, DcMotor leftBack, DcMotor rightBack,
                            IMU imu, OverPath.Constants constants, HardwareMap hardwareMap, Telemetry telemetry,
                            Running running, String[] names) {
        this.drive = drive;
        this.motors = new DcMotor[] {leftFront, rightFront, leftBack, rightBack};
        this.imu = imu;
        this.k = constants;
        this.hardwareMap = hardwareMap;
        this.telemetry = telemetry;
        this.running = running;
        this.names = names;
    }

    public boolean directions() {
        OverPath tr = tracker(0, 0, 0);
        for (int i = 0; i < 4; i++) {
            if (motors[i] == null || !running.ok()) continue;
            stopAll();
            if (!idle(tr, 300)) return false;
            int e0 = motors[i].getCurrentPosition();
            double h0 = tr.getHeading();
            motors[i].setPower(0.35);
            boolean ok = idle(tr, 600, "WHEEL " + (i + 1) + ": " + name(i));
            stopAll();
            if (!ok || !idle(tr, 400)) return false;
            int moved = motors[i].getCurrentPosition() - e0;
            double turned = OverPath.wrap(tr.getHeading() - h0);
            boolean left = i == 0 || i == 2;
            double expect = left ? -1 : 1;
            if (Math.abs(moved) < 20) report.add(name(i) + ": NO ENCODER COUNTS - check the encoder cable");
            if (Math.abs(turned) < 1.5) {
                report.add(name(i) + ": the robot barely moved - is the wheel touching the floor?");
            } else if (Math.signum(turned) != expect) {
                report.add(name(i) + ": spins BACKWARDS - tick Reversed for it in the planner");
            } else if (moved < -20) {
                report.add(name(i) + ": drives forward but its encoder counts backwards");
            } else {
                report.add(name(i) + ": OK");
            }
        }
        return true;
    }

    public boolean minPower() {
        double fwd = rampUntilMoving(1, 0, 0, 1);
        if (Double.isNaN(fwd)) return false;
        double str = 0;
        if (drive == OverPath.Drive.MECANUM) {
            str = rampUntilMoving(0, 1, 0, -1);
            if (Double.isNaN(str)) return false;
        }
        double turn = rampUntilMoving(0, 0, 1, 1);
        if (Double.isNaN(turn)) return false;
        minPower = round(Math.min(0.5, Math.max(fwd, str) * 1.15), 3);
        turnMinPower = round(Math.min(0.5, turn * 1.15), 3);
        return true;
    }

    public boolean speedAndBraking() {
        double[] powers = {0.4, 0.6, 0.8};
        List<double[]> stops = new ArrayList<double[]>();
        double perPower = 0;
        int n = 0;
        for (int j = 0; j < powers.length * 2; j++) {
            double p = powers[j / 2];
            double sign = j % 2 == 0 ? 1 : -1;
            OverPath tr = tracker(0, 0, 0);
            ElapsedTime t = new ElapsedTime();
            double mag = 0;
            double ref = 0;
            ElapsedTime steady = new ElapsedTime();
            double startX = tr.getX();
            while (running.ok()) {
                double dt = t.seconds();
                t.reset();
                mag = Math.min(p, mag + 2.0 * dt);
                setAll(sign * mag, 0, 0);
                tr.track();
                double v = tr.getSpeed();
                if (mag < p || Math.abs(v - ref) > 0.02 * Math.max(1, ref)) {
                    ref = v;
                    steady.reset();
                }
                show("SPEED + BRAKING " + (j + 1) + "/" + (powers.length * 2), String.format(Locale.US, "power %.1f  speed %.1f in/s", p, v));
                if (steady.milliseconds() > 200) break;
                if (Math.abs(tr.getX() - startX) > 40) {
                    report.add("Speed test ran out of room at power " + fmt(p) + ": top speed may read low.");
                    break;
                }
            }
            if (!running.ok()) return stopped();
            double vCut = tr.getSpeed();
            perPower += vCut / p;
            n++;
            double cutX = tr.getX();
            double cutY = tr.getY();
            ElapsedTime rest = new ElapsedTime();
            while (running.ok()) {
                double dt = t.seconds();
                t.reset();
                mag = dropRate > 0 ? Math.max(0, mag - dropRate * dt) : 0;
                setAll(sign * mag, 0, 0);
                tr.track();
                if (mag > 0 || tr.getSpeed() > 0.3) rest.reset();
                if (rest.milliseconds() > 200) break;
            }
            if (!running.ok()) return stopped();
            stops.add(new double[] {vCut, Math.hypot(tr.getX() - cutX, tr.getY() - cutY)});
        }
        stopAll();
        maxSpeedInPerSec = round(perPower / n, 1);
        double[] ab = fitCoast(stops);
        brakeLinear = round(ab[0], 4);
        brakeQuadratic = round(ab[1], 6);
        return true;
    }

    public boolean turnRadius() {
        OverPath tr = tracker(0, 0, 0);
        if (!idle(tr, 200)) return false;
        int[] e0 = ticks();
        double total = 0;
        double h = tr.getHeading();
        double mag = 0;
        ElapsedTime t = new ElapsedTime();
        while (running.ok() && Math.abs(total) < 720) {
            double dt = t.seconds();
            t.reset();
            mag = Math.min(0.4, mag + 2.0 * dt);
            setAll(0, 0, mag);
            tr.track();
            total += OverPath.wrap(tr.getHeading() - h);
            h = tr.getHeading();
            show("TURN RADIUS", String.format(Locale.US, "%.0f / 720 deg", Math.abs(total)));
        }
        if (!softStop(tr)) return false;
        total += OverPath.wrap(tr.getHeading() - h);
        int[] e1 = ticks();
        double tpi = k.ticksPerInch();
        double[] d = new double[4];
        for (int i = 0; i < 4; i++) d[i] = motors[i] == null ? 0 : (e1[i] - e0[i]) / tpi;
        double arc = drive == OverPath.Drive.MECANUM
                ? (-d[0] + d[1] - d[2] + d[3]) / 4
                : ((motors[3] == null ? d[1] : (d[1] + d[3]) / 2) - (motors[2] == null ? d[0] : (d[0] + d[2]) / 2)) / 2;
        turnRadiusIn = round(Math.abs(arc / Math.toRadians(total)), 3);
        return true;
    }

    public boolean gripLimits() {
        double y0 = -72 + robotLengthIn / 2 + 3;
        OverPath r = runner(0, y0, 90);
        r.squareToWall(OverPath.Wall.REAR, OverPath.Face.BACK, squarePower);
        if (!run(r, "GRIP: first touch")) return false;
        double[] pose = {r.getX(), r.getY(), r.getHeading()};
        double b1 = launchTrip(pose, y0, 1.5, 2, "GRIP: gentle 1/2");
        double b2 = launchTrip(pose, y0, 1.5, 2, "GRIP: gentle 2/2");
        if (!running.ok()) return stopped();
        if (Double.isNaN(b1) || Double.isNaN(b2)) {
            report.add("Grip test: the wheels spin at the wall, so the touches can't measure anything. Lower the wall-touch power and retry.");
            return false;
        }
        double base = (b1 + b2) / 2;
        double tol = Math.max(0.4, 3 * Math.abs(b1 - b2));
        double[] rates = {3, 4, 6, 8, 12};
        double rise = 1.5;
        for (double rate : rates) {
            double c = launchTrip(pose, y0, rate, 2, "GRIP: rise " + fmt(rate) + " /s");
            if (Double.isNaN(c)) {
                if (!running.ok()) return stopped();
                break;
            }
            if (Math.abs(c - base) > tol) break;
            rise = rate;
        }
        double drop = 2;
        for (double rate : rates) {
            double c = launchTrip(pose, y0, 1.5, rate, "GRIP: brake " + fmt(rate) + " /s");
            if (Double.isNaN(c)) {
                if (!running.ok()) return stopped();
                break;
            }
            if (Math.abs(c - base) > tol) break;
            drop = rate;
        }
        maxPowerRatePerS = rise;
        maxPowerDropPerS = drop;
        if (rise <= 1.5) report.add("Wheels slip even on a gentle start: check wheel wear and tile cleanliness.");
        return true;
    }

    private double launchTrip(double[] pose, double y0, double rise, double drop, String title) {
        OverPath out = runner(pose[0], pose[1], pose[2]);
        out.maxPowerRatePerS = rise;
        out.maxPowerDropPerS = drop;
        out.driveTo(pose[0], y0 + 36, 0.9);
        if (!run(out, title)) return Double.NaN;
        OverPath back = runner(out.getX(), out.getY(), out.getHeading());
        back.maxPowerRatePerS = 1.5;
        back.maxPowerDropPerS = 2;
        back.driveTo(pose[0], y0, 0.5).squareToWall(OverPath.Wall.REAR, OverPath.Face.BACK, squarePower);
        if (!run(back, title)) return Double.NaN;
        pose[0] = back.getX();
        pose[1] = back.getY();
        pose[2] = back.getHeading();
        return back.lastWallCorrectionIn();
    }

    public boolean wallTrips(boolean strafe, int trips) {
        double half = (strafe ? robotWidthIn : robotLengthIn) / 2;
        double y0 = -72 + half + 3;
        double h0 = strafe ? 0 : 90;
        OverPath.Face face = strafe ? OverPath.Face.RIGHT : OverPath.Face.BACK;
        OverPath r = runner(0, y0, h0);
        r.squareToWall(OverPath.Wall.REAR, face, squarePower);
        if (!run(r, "WALL TRIPS: first touch")) return false;
        List<Double> into = strafe ? strafeTrips : forwardTrips;
        int spins = 0;
        for (int i = 0; i < trips && running.ok(); i++) {
            double x = r.getX();
            double y = r.getY();
            OverPath trip = runner(x, y, r.getHeading());
            trip.driveTo(x, y + tripIn, 0.6)
                    .turnTo(h0 + 90, 0.5)
                    .turnTo(h0, 0.5)
                    .driveTo(x, y0, 0.6)
                    .squareToWall(OverPath.Wall.REAR, face, squarePower);
            if (!run(trip, "WALL TRIPS: " + (strafe ? "strafe" : "forward") + " " + (i + 1) + "/" + trips)) return false;
            double c = trip.lastWallCorrectionIn();
            if (Double.isNaN(c)) spins++;
            else into.add(c);
            if (!Double.isNaN(trip.lastWallCorrectionDeg())) headingTrips.add(trip.lastWallCorrectionDeg());
            r = trip;
        }
        if (!running.ok()) return stopped();
        if (spins > 0) report.add(spins + " wall touch(es) had the wheels spinning at the wall: left out.");
        double sd = sd(into);
        if (!Double.isNaN(sd)) {
            if (strafe) strafePct = round(sd / (tripIn * Math.sqrt(2)), 4);
            else alongPct = round(sd / (tripIn * Math.sqrt(2)), 4);
        }
        double sdh = sd(headingTrips);
        if (!Double.isNaN(sdh)) turnSigmaDeg = round(sdh / Math.sqrt(2), 3);
        return true;
    }

    public boolean wallTripsBoth(int trips) {
        if (!wallTrips(false, trips)) return false;
        if (drive != OverPath.Drive.MECANUM) return true;
        double y = -72 + robotLengthIn / 2 + 1;
        OverPath r = runner(0, y, 90);
        r.driveTo(0, -72 + Math.hypot(robotLengthIn, robotWidthIn) / 2 + 3, 0.4).turnTo(0, 0.4);
        if (!run(r, "WALL TRIPS: turning for the strafe trips")) return false;
        return wallTrips(true, trips);
    }

    public boolean venueCheck() {
        if (!wallTripsBoth(3)) return false;
        double half = (drive == OverPath.Drive.MECANUM ? robotWidthIn : robotLengthIn) / 2;
        OverPath r = runner(0, -72 + half + 1, drive == OverPath.Drive.MECANUM ? 0 : 90);
        r.driveTo(0, -72 + 30, 0.4);
        if (!run(r, "VENUE CHECK: out for the turn test")) return false;
        return turnRadius();
    }

    public List<String> summary() {
        List<String> out = new ArrayList<String>();
        add(out, "Min power", minPower, "");
        add(out, "Turn min power", turnMinPower, "");
        add(out, "Max speed", maxSpeedInPerSec, " in/s");
        add(out, "Coast per in/s", brakeLinear, " s");
        add(out, "Coast per (in/s)^2", brakeQuadratic, "");
        add(out, "Turn radius", turnRadiusIn, " in");
        add(out, "Power rise limit", maxPowerRatePerS, " /s");
        add(out, "Power drop limit", maxPowerDropPerS, " /s");
        if (!Double.isNaN(alongPct)) out.add(String.format(Locale.US, "Drive error: %.2f %%", alongPct * 100));
        if (!Double.isNaN(strafePct)) out.add(String.format(Locale.US, "Strafe error: %.2f %%", strafePct * 100));
        add(out, "Turn error", turnSigmaDeg, " deg");
        return out;
    }

    public String json(String profile) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\n  \"kind\": \"overpath-calibration\",\n  \"version\": 1,\n  \"overpath\": \"").append(OverPath.VERSION).append("\",\n");
        sb.append("  \"drivetrain\": \"").append(drive.name()).append("\",\n");
        sb.append("  \"profile\": \"").append(esc(profile)).append("\",\n");
        sb.append("  \"values\": {");
        String[] keys = {"minPower", "turnMinPower", "maxSpeedInPerSec", "brakeLinear", "brakeQuadratic", "turnRadiusIn", "maxPowerRatePerS", "maxPowerDropPerS", "alongPct", "strafePct", "turnSigmaDeg"};
        double[] vals = {minPower, turnMinPower, maxSpeedInPerSec, brakeLinear, brakeQuadratic, turnRadiusIn, maxPowerRatePerS, maxPowerDropPerS, alongPct, strafePct, turnSigmaDeg};
        boolean first = true;
        for (int i = 0; i < keys.length; i++) {
            if (Double.isNaN(vals[i]) || Double.isInfinite(vals[i])) continue;
            sb.append(first ? "\n" : ",\n").append("    \"").append(keys[i]).append("\": ").append(num(vals[i]));
            first = false;
        }
        sb.append(first ? "},\n" : "\n  },\n");
        sb.append("  \"trips\": {\"forwardIn\": ").append(list(forwardTrips)).append(", \"strafeIn\": ").append(list(strafeTrips))
                .append(", \"headingDeg\": ").append(list(headingTrips)).append(", \"tripIn\": ").append(num(tripIn)).append("},\n");
        sb.append("  \"report\": [");
        for (int i = 0; i < report.size(); i++) sb.append(i == 0 ? "" : ", ").append('"').append(esc(report.get(i))).append('"');
        sb.append("]\n}\n");
        return sb.toString();
    }

    public boolean save(String profile) {
        File dir = new File(OverPath.filesDir);
        if (!dir.isDirectory() && !dir.mkdirs()) return false;
        String text = json(profile);
        return write(new File(dir, "calibration.json"), text)
                && write(new File(dir, "calibration-" + System.currentTimeMillis() + ".json"), text);
    }

    public static final class FileServer implements Runnable {
        private final ServerSocket socket;
        private final Thread thread;
        private volatile boolean open = true;

        public FileServer(int port) throws IOException {
            socket = new ServerSocket(port);
            thread = new Thread(this, "OverPath files");
            thread.setDaemon(true);
            thread.start();
        }

        public void close() {
            open = false;
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }

        @Override public void run() {
            while (open) {
                try (Socket c = socket.accept()) {
                    serve(c);
                } catch (IOException e) {
                    if (!open) return;
                }
            }
        }

        private static void serve(Socket c) throws IOException {
            c.setSoTimeout(3000);
            InputStream in = c.getInputStream();
            StringBuilder head = new StringBuilder();
            int b;
            while ((b = in.read()) != -1 && head.length() < 4096) {
                head.append((char) b);
                if (head.length() >= 4 && head.substring(head.length() - 4).equals("\r\n\r\n")) break;
            }
            String[] first = head.toString().split("\r\n", 2)[0].split(" ");
            OutputStream out = c.getOutputStream();
            if (first.length < 2 || !(first[0].equals("GET") || first[0].equals("HEAD"))) {
                reply(out, 405, "text/plain", "GET only".getBytes(UTF8), false);
                return;
            }
            String path = first[1];
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            boolean headOnly = first[0].equals("HEAD");
            File dir = new File(OverPath.filesDir);
            if (path.equals("/") || path.equals("/index.html")) {
                reply(out, 200, "text/html; charset=utf-8", index(dir).getBytes(UTF8), headOnly);
            } else if (path.equals("/list.json")) {
                reply(out, 200, "application/json", listJson(dir).getBytes(UTF8), headOnly);
            } else {
                String name = path.substring(1);
                File f = new File(dir, name);
                if (!name.matches("[A-Za-z0-9._-]{1,80}") || !f.isFile()) {
                    reply(out, 404, "text/plain", "not found".getBytes(UTF8), headOnly);
                    return;
                }
                String type = name.endsWith(".json") ? "application/json" : name.endsWith(".csv") ? "text/csv" : "text/plain";
                reply(out, 200, type, read(f), headOnly);
            }
        }

        private static void reply(OutputStream out, int code, String type, byte[] body, boolean headOnly) throws IOException {
            String status = code == 200 ? "OK" : code == 404 ? "Not Found" : "Method Not Allowed";
            String h = "HTTP/1.0 " + code + " " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length
                    + "\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
            out.write(h.getBytes(UTF8));
            if (!headOnly) out.write(body);
            out.flush();
        }

        private static File[] files(File dir) {
            File[] fs = dir.listFiles();
            if (fs == null) return new File[0];
            List<File> keep = new ArrayList<File>();
            for (File f : fs) if (f.isFile() && f.getName().matches("[A-Za-z0-9._-]{1,80}")) keep.add(f);
            File[] out = keep.toArray(new File[0]);
            Arrays.sort(out, (a, b2) -> Long.compare(b2.lastModified(), a.lastModified()));
            return out;
        }

        private static String index(File dir) {
            StringBuilder sb = new StringBuilder("<!doctype html><meta charset=utf-8><title>OverPath files</title>"
                    + "<body style=\"font-family:sans-serif;max-width:40em;margin:2em auto\"><h1>OverPath files</h1>"
                    + "<p>Download a file, then import it in the planner (calibration: Settings &gt; Constants; runs: Path tab &gt; Runs).</p><ul>");
            for (File f : files(dir)) {
                sb.append("<li><a download href=\"").append(f.getName()).append("\">").append(f.getName()).append("</a> (")
                        .append(f.length() / 1024 + 1).append(" KB)</li>");
            }
            return sb.append("</ul></body>").toString();
        }

        private static String listJson(File dir) {
            StringBuilder sb = new StringBuilder("[");
            File[] fs = files(dir);
            for (int i = 0; i < fs.length; i++) {
                sb.append(i == 0 ? "" : ",").append("{\"name\":\"").append(fs[i].getName()).append("\",\"size\":").append(fs[i].length())
                        .append(",\"modified\":").append(fs[i].lastModified()).append('}');
            }
            return sb.append(']').toString();
        }

        private static byte[] read(File f) throws IOException {
            try (FileInputStream in = new FileInputStream(f)) {
                byte[] buf = new byte[(int) Math.min(f.length(), 8L * 1024 * 1024)];
                int off = 0;
                int r;
                while (off < buf.length && (r = in.read(buf, off, buf.length - off)) > 0) off += r;
                return off == buf.length ? buf : Arrays.copyOf(buf, off);
            }
        }
    }

    private static final Charset UTF8 = Charset.forName("UTF-8");

    private OverPath runner(double x, double y, double h) {
        OverPath r = new OverPath(drive, motors[0], motors[1], motors[2], motors[3], imu, k);
        if (hardwareMap != null) r.useHardwareMap(hardwareMap);
        r.robotLengthIn = robotLengthIn;
        r.robotWidthIn = robotWidthIn;
        r.maxPowerDropPerS = dropRate;
        r.rampIn = rampIn;
        r.setStartPose(x, y, h);
        return r;
    }

    private OverPath tracker(double x, double y, double h) {
        OverPath r = runner(x, y, h);
        r.track();
        return r;
    }

    private boolean run(OverPath r, String title) {
        while (running.ok() && r.isBusy()) {
            r.update();
            show(title, String.format(Locale.US, "x %.1f  y %.1f  h %.1f", r.getX(), r.getY(), r.getHeading()));
        }
        if (!running.ok()) {
            r.stop();
            return stopped();
        }
        return true;
    }

    private double rampUntilMoving(double f, double s, double turn, double dir) {
        OverPath tr = tracker(0, 0, 0);
        if (!idle(tr, 300)) return Double.NaN;
        ElapsedTime t = new ElapsedTime();
        double p = 0;
        int moving = 0;
        double h = tr.getHeading();
        String what = turn != 0 ? "turn" : s != 0 ? "strafe" : "forward";
        while (running.ok() && p < 0.5) {
            double dt = Math.max(1e-3, t.seconds());
            t.reset();
            p += 0.12 * dt;
            setAll(f * p * dir, s * p * dir, turn * p * dir);
            tr.track();
            double rate = Math.abs(OverPath.wrap(tr.getHeading() - h)) / dt;
            h = tr.getHeading();
            boolean go = turn != 0 ? rate > 8 : tr.getSpeed() > 1.5;
            moving = go ? moving + 1 : 0;
            show("MIN POWER: " + what, String.format(Locale.US, "power %.3f", p));
            if (moving >= 3) break;
        }
        double found = p;
        if (!softStop(tr)) return Double.NaN;
        if (found >= 0.5) report.add("The robot didn't move " + what + " below 0.5 power: something is binding.");
        return found;
    }

    private boolean softStop(OverPath tr) {
        stopAll();
        return idle(tr, 400);
    }

    private boolean idle(OverPath tr, double ms) {
        return idle(tr, ms, null);
    }

    private boolean idle(OverPath tr, double ms, String title) {
        ElapsedTime t = new ElapsedTime();
        while (running.ok() && t.milliseconds() < ms) {
            tr.track();
            if (title != null) show(title, "");
        }
        if (!running.ok()) return stopped();
        return true;
    }

    private boolean stopped() {
        stopAll();
        return false;
    }

    private void setAll(double f, double s, double turn) {
        double sw = drive == OverPath.Drive.MECANUM ? s * k.strafeMultiplier : 0;
        double[] out = new double[4];
        double norm = 1;
        for (int i = 0; i < 4; i++) {
            out[i] = f + STRAFE[i] * sw + TURN[i] * turn;
            norm = Math.max(norm, Math.abs(out[i]));
        }
        for (int i = 0; i < 4; i++) if (motors[i] != null) motors[i].setPower(out[i] / norm);
    }

    private void stopAll() {
        for (DcMotor m : motors) if (m != null) m.setPower(0);
    }

    private int[] ticks() {
        int[] t = new int[4];
        for (int i = 0; i < 4; i++) t[i] = motors[i] == null ? 0 : motors[i].getCurrentPosition();
        return t;
    }

    private void show(String title, String line) {
        if (telemetry == null) return;
        telemetry.addLine(title + "   (Y = stop)");
        if (!line.isEmpty()) telemetry.addLine(line);
        telemetry.update();
    }

    private String name(int i) {
        return names != null && i < names.length ? names[i] : "wheel " + (i + 1);
    }

    static double[] fitCoast(List<double[]> s) {
        double s2 = 0;
        double s3 = 0;
        double s4 = 0;
        double sdv = 0;
        double sdv2 = 0;
        for (double[] p : s) {
            double v = p[0];
            double d = p[1];
            s2 += v * v;
            s3 += v * v * v;
            s4 += v * v * v * v;
            sdv += d * v;
            sdv2 += d * v * v;
        }
        double det = s2 * s4 - s3 * s3;
        if (Math.abs(det) > 1e-9) {
            double a = (sdv * s4 - sdv2 * s3) / det;
            double b = (s2 * sdv2 - s3 * sdv) / det;
            if (b >= 0 && a >= 0) return new double[] {a, b};
        }
        return new double[] {s2 > 0 ? Math.max(0, sdv / s2) : 0.08, 0};
    }

    static double sd(List<Double> v) {
        if (v.size() < 2) return Double.NaN;
        double m = 0;
        for (double x : v) m += x;
        m /= v.size();
        double ss = 0;
        for (double x : v) ss += (x - m) * (x - m);
        return Math.sqrt(ss / (v.size() - 1));
    }

    private static double round(double v, int digits) {
        double f = Math.pow(10, digits);
        return Math.round(v * f) / f;
    }

    private static String fmt(double v) {
        return String.format(Locale.US, "%.1f", v);
    }

    private static void add(List<String> out, String label, double v, String unit) {
        if (!Double.isNaN(v)) out.add(String.format(Locale.US, "%s: %s%s", label, num(v), unit));
    }

    private static String num(double v) {
        String s = String.format(Locale.US, "%.6f", v);
        s = s.replaceAll("0+$", "");
        return s.endsWith(".") ? s + "0" : s;
    }

    private static String list(List<Double> v) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < v.size(); i++) sb.append(i == 0 ? "" : ", ").append(num(v.get(i)));
        return sb.append(']').toString();
    }

    private static String esc(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static boolean write(File f, String text) {
        try (Writer w = new OutputStreamWriter(new FileOutputStream(f), UTF8)) {
            w.write(text);
            return true;
        } catch (IOException e) {
            return false;
        }
    }
}
