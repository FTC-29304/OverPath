package org.firstinspires.ftc.teamcode.overpath;

import com.qualcomm.hardware.lynx.LynxModule;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.hardware.IMU;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.hardware.VoltageSensor;
import com.qualcomm.robotcore.util.ElapsedTime;

import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.Charset;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class OverPath {
    public static final String VERSION = "3.0.0";

    public enum Drive { MECANUM, TANK }

    public enum Wall { LEFT, RIGHT, AUDIENCE, REAR }

    public enum Face { FRONT, BACK, LEFT, RIGHT }

    public enum OnBlocked { SKIP, RETRY_ONCE, ABORT }

    public static class Constants {
        public final double ticksPerRev;
        public final double gearRatio;
        public final double wheelDiameterIn;
        public final double strafeMultiplier;

        public Constants(double ticksPerRev, double gearRatio, double wheelDiameterIn, double strafeMultiplier) {
            this.ticksPerRev = ticksPerRev;
            this.gearRatio = gearRatio;
            this.wheelDiameterIn = wheelDiameterIn;
            this.strafeMultiplier = strafeMultiplier;
        }

        public double ticksPerInch() {
            return ticksPerRev * gearRatio / (Math.PI * wheelDiameterIn);
        }
    }

    public double headingKp = 0.02;
    public double maxHeadingCorrection = 0.3;
    public double turnKp = 0.015;
    public double turnMinPower = 0.12;
    public double turnTolDeg = 1.5;
    public long settleMs = 150;
    public double minPower = 0.15;
    public double rampIn = 6.0;
    public double posTolIn = 0.3;
    public double finishSpeedInPerSec = 0.5;
    public double correctionKSq = 0.08;
    public double brakeLinear = 0.08;
    public double brakeQuadratic = 0.0;
    public boolean learnBrake = true;
    public double maxDrivePower = 0.9;
    public double maxPowerRatePerS = 2.0;
    public double maxPowerDropPerS = 4.0;
    public double slipTolInPerSec = 3.0;
    public boolean slipCorrection = false;
    public double timeoutSpeedInPerSec = 20.0;
    public long turnTimeoutMs = 3000;
    public long squareTimeoutMs = 4000;

    public double stallInPerSec = 2.0;
    public long stallMs = 150;
    public long stallArmMs = 250;
    public double blockedTolIn = 2.0;
    public OnBlocked onBlocked = OnBlocked.SKIP;

    public double robotLengthIn = 18.0;
    public double robotWidthIn = 18.0;
    public long squareSettleMs = 250;
    public double backOffIn = 1.0;
    public double wallOvershootIn = 4.0;

    public double turnRadiusIn = 12.0;
    public double imuFreezeDegPerSec = 30.0;
    public long imuFreezeMs = 200;
    public double imuMaxJumpDeg = 20.0;
    public int settleCorrections = 2;

    private static final double[] STRAFE = {1, -1, -1, 1};
    private static final double[] TURN = {-1, 1, -1, 1};
    private static final double HALF_FIELD = 72.0;

    private final Drive drive;
    private final DcMotor[] motors;
    private final IMU imu;
    private final Constants k;
    private final List<Step> steps = new ArrayList<Step>();
    private final Map<String, Runnable> commands = new HashMap<String, Runnable>();
    private final Map<String, Runnable> commandStops = new HashMap<String, Runnable>();
    private final List<Background> background = new ArrayList<Background>();
    private final ElapsedTime stepTimer = new ElapsedTime();
    private final ElapsedTime loopTimer = new ElapsedTime();

    private double startX = 0;
    private double startY = 0;
    private double startHeading = 0;
    private double poseX = 0;
    private double poseY = 0;
    private double heading = 0;
    private double targetHeading = 0;
    private double headingOffset = 0;
    private int[] lastTicks = new int[4];
    private boolean trackerReady = false;
    private double lastDtMs = 0;
    private double transSpeed = 0;
    private double instSpeed = 0;

    private VoltageSensor battery;
    private double voltage = Double.NaN;
    private double voltageAgeMs = Double.POSITIVE_INFINITY;
    private final double[] lastPower = {Double.NaN, Double.NaN, Double.NaN, Double.NaN};
    private double slewMag = 0;
    private final double[] lastOut = new double[4];
    private double loopMsAvg = 0;

    public static String filesDir = "/sdcard/FIRST/overpath";
    public static int keepRuns = 20;
    private StringBuilder log;
    private String logName = "run";
    private boolean logWritten = false;
    private String logFile = null;
    private final ElapsedTime runClock = new ElapsedTime();
    private final double[][] travel = new double[2][4];
    private final int[] turnsSince = new int[2];
    private final double[] axisSince = new double[2];
    private int turnsSinceHeading = 0;
    private double headingSince = 0;

    private static final int SLIP_WINDOW = 6;
    private final double[][] slipWin = new double[SLIP_WINDOW][6];
    private final double[] winSum = new double[6];
    private final double[][] slipDev = new double[SLIP_WINDOW][4];
    private final double[] devSum = new double[4];
    private double prevPlus = 0;
    private double prevMinus = 0;
    private double lastLoopDt = 0;
    private int slipPos = 0;
    private boolean slipping = false;
    private int slipEvents = 0;

    private boolean imuOk = true;
    private double lastImuYaw = Double.NaN;
    private double freezeMs = 0;
    private double learnArcIn = 0;
    private double learnRad = 0;

    private int index = 0;
    private boolean started = false;
    private boolean stepStarted = false;
    private boolean finished = false;
    private boolean abortRequested = false;
    private int timeouts = 0;
    private int blocked = 0;
    private int wallSquares = 0;
    private double lastSquareCorrIn = Double.NaN;
    private int coastSamples = 0;
    private double lastSquareCorrDeg = Double.NaN;
    private String lastWarning = "";

    public OverPath(Drive drive, DcMotor leftFront, DcMotor rightFront, DcMotor leftBack, DcMotor rightBack,
                    IMU imu, Constants constants) {
        if (leftFront == null || rightFront == null || imu == null) {
            throw new IllegalArgumentException("OverPath: leftFront, rightFront and imu are required");
        }
        if (drive == Drive.MECANUM && (leftBack == null || rightBack == null)) {
            throw new IllegalArgumentException("OverPath: mecanum needs all four motors");
        }
        this.drive = drive;
        this.motors = new DcMotor[] {leftFront, rightFront, leftBack, rightBack};
        this.imu = imu;
        this.k = constants;
    }

    public OverPath useHardwareMap(HardwareMap hardwareMap) {
        for (LynxModule hub : hardwareMap.getAll(LynxModule.class)) {
            hub.setBulkCachingMode(LynxModule.BulkCachingMode.AUTO);
        }
        List<VoltageSensor> sensors = hardwareMap.getAll(VoltageSensor.class);
        battery = sensors.isEmpty() ? null : sensors.get(0);
        return this;
    }

    public OverPath setStartPose(double x, double y, double headingDeg) {
        startX = x;
        startY = y;
        poseX = x;
        poseY = y;
        return setStartHeading(headingDeg);
    }

    public OverPath setStartHeading(double deg) {
        startHeading = deg;
        targetHeading = wrap(deg);
        heading = targetHeading;
        return this;
    }

    public OverPath registerCommand(String name, Runnable action) {
        commands.put(name, action);
        return this;
    }

    public OverPath registerCommand(String name, Runnable start, Runnable stop) {
        commands.put(name, start);
        commandStops.put(name, stop);
        return this;
    }

    public OverPath driveTo(double x, double y, double power) {
        return add(new DriveToStep(x, y, power, false, 0, 0));
    }

    public OverPath reversed() {
        Step last = steps.isEmpty() ? null : steps.get(steps.size() - 1);
        if (!(last instanceof DriveToStep)) throw new IllegalStateException("OverPath: reversed() must come right after driveTo");
        ((DriveToStep) last).reversed = true;
        return this;
    }

    public OverPath drive(double inches, double power) {
        DriveToStep s = new DriveToStep(0, 0, power, true, inches, 0);
        if (drive == Drive.TANK && inches < 0) s.reversed = true;
        return add(s);
    }

    public OverPath strafe(double inchesRight, double power) {
        return driveVector(0, inchesRight, power);
    }

    public OverPath driveVector(double forwardIn, double strafeRightIn, double power) {
        if (drive == Drive.TANK && strafeRightIn != 0) {
            throw new IllegalStateException("OverPath: a tank drive cannot strafe");
        }
        return add(new DriveToStep(0, 0, power, true, forwardIn, strafeRightIn));
    }

    public OverPath turnTo(double headingDeg, double power) {
        return add(new TurnStep(headingDeg, false, power));
    }

    public OverPath turnBy(double deltaDeg, double power) {
        return add(new TurnStep(deltaDeg, true, power));
    }

    public OverPath squareToWall(Wall wall, Face face, double power) {
        return squareToWall(wall, face, power, true);
    }

    public OverPath squareToWall(Wall wall, Face face, double power, boolean alignHeading) {
        if (drive == Drive.TANK && (face == Face.LEFT || face == Face.RIGHT)) {
            throw new IllegalStateException("OverPath: a tank drive can only square its FRONT or BACK to a wall");
        }
        return add(new SquareStep(wall, face, power, alignHeading));
    }

    public OverPath waitMs(long ms) {
        return add(new WaitStep(ms));
    }

    public OverPath servo(final Servo servo, final double position) {
        return add(new InstantStep("servo -> " + fmt(position), new Runnable() {
            @Override public void run() { servo.setPosition(position); }
        }));
    }

    public OverPath motorPower(final DcMotorSimple motor, final double power) {
        return add(new InstantStep("motor -> " + fmt(power), new Runnable() {
            @Override public void run() { motor.setPower(power); }
        }));
    }

    public OverPath motorFor(final DcMotorSimple motor, final double power, long ms) {
        return add(new TimedStep("motor " + fmt(power) + " for " + ms + " ms", ms, new Runnable() {
            @Override public void run() { motor.setPower(power); }
        }, new Runnable() {
            @Override public void run() { motor.setPower(0); }
        }));
    }

    public OverPath startMotorFor(final DcMotorSimple motor, final double power, final long ms) {
        return add(new InstantStep("start motor " + fmt(power) + " for " + ms + " ms", new Runnable() {
            @Override public void run() {
                motor.setPower(power);
                background.add(new Background("motor " + fmt(power), ms, new Runnable() {
                    @Override public void run() { motor.setPower(0); }
                }));
            }
        }));
    }

    public OverPath command(final String name) {
        return add(new InstantStep("command " + name, new Runnable() {
            @Override public void run() { runCommand(name); }
        }));
    }

    public OverPath commandFor(final String name, long ms) {
        return add(new TimedStep("command " + name + " for " + ms + " ms", ms, new Runnable() {
            @Override public void run() { runCommand(name); }
        }, new Runnable() {
            @Override public void run() { runStop(name); }
        }));
    }

    public OverPath startCommandFor(final String name, final long ms) {
        return add(new InstantStep("start command " + name + " for " + ms + " ms", new Runnable() {
            @Override public void run() {
                runCommand(name);
                background.add(new Background("command " + name, ms, new Runnable() {
                    @Override public void run() { runStop(name); }
                }));
            }
        }));
    }

    public OverPath marker(double t, final String commandName) {
        return marker(t, new Runnable() {
            @Override public void run() { runCommand(commandName); }
        });
    }

    public OverPath marker(double t, Runnable action) {
        Step last = steps.isEmpty() ? null : steps.get(steps.size() - 1);
        if (!(last instanceof DriveToStep)) {
            throw new IllegalStateException("OverPath: marker() must come right after driveTo/drive/strafe/driveVector");
        }
        DriveToStep move = (DriveToStep) last;
        Marker m = new Marker(Math.max(0, Math.min(1, t)), action);
        int i = 0;
        while (i < move.markers.size() && move.markers.get(i).t <= m.t) i++;
        move.markers.add(i, m);
        return this;
    }

    public OverPath timeout(long ms) {
        if (steps.isEmpty()) throw new IllegalStateException("OverPath: timeout() needs a step before it");
        steps.get(steps.size() - 1).timeoutMs = ms;
        return this;
    }

    public void start() {
        if (started) return;
        started = true;
        imu.resetYaw();
        for (DcMotor m : motors) {
            if (m == null) continue;
            m.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
            m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        }
        for (int i = 0; i < 4; i++) lastPower[i] = Double.NaN;
        slewMag = 0;
        poseX = startX;
        poseY = startY;
        targetHeading = wrap(startHeading);
        heading = targetHeading;
        headingOffset = startHeading;
        lastImuYaw = readImuYaw();
        if (Double.isNaN(lastImuYaw)) {
            imuOk = false;
            lastWarning = "IMU not found or not configured: using wheel heading (less accurate)";
        }
        trackerReady = false;
        loopTimer.reset();
        index = 0;
        stepStarted = false;
        finished = false;
        abortRequested = false;
        runClock.reset();
        for (double[] t : travel) Arrays.fill(t, 0);
        Arrays.fill(turnsSince, 0);
        Arrays.fill(axisSince, 0);
        turnsSinceHeading = 0;
        headingSince = 0;
        if (log != null) {
            log.setLength(0);
            logWritten = false;
            log.append("# overpath-run 1\n# version ").append(VERSION).append("\n# name ").append(logName).append('\n');
            log.append("# drivetrain ").append(drive.name()).append('\n');
            log.append(String.format(Locale.US, "# robot %.2f %.2f%n", robotLengthIn, robotWidthIn));
            log.append(String.format(Locale.US, "# start %.2f %.2f %.2f%n", startX, startY, startHeading));
            log.append(String.format(Locale.US, "# constants ticksPerRev=%s gearRatio=%s wheelDiameterIn=%s strafeMultiplier=%s%n",
                    num(k.ticksPerRev), num(k.gearRatio), num(k.wheelDiameterIn), num(k.strafeMultiplier)));
            log.append("# S,t,step,x,y,heading,speed,volts,slipping\n# E,t,step,kind,details...\n");
        }
    }

    public void update() {
        if (!started) start();
        updatePose();
        updateBackground();
        sample();
        if (index >= steps.size()) {
            if (!finished) {
                stopDrive();
                finished = true;
                event("end", "");
            }
            if (background.isEmpty()) writeLog();
            return;
        }
        Step s = steps.get(index);
        if (!stepStarted) {
            stepTimer.reset();
            event("step", s.describe());
            s.start();
            stepStarted = true;
        }
        boolean done = s.run();
        long limit = s.timeoutMs >= 0 ? s.timeoutMs : s.defaultTimeoutMs();
        if (!done && limit > 0 && stepTimer.milliseconds() > limit) {
            done = true;
            timeouts++;
            lastWarning = "Step " + (index + 1) + " (" + s.describe() + ") timed out";
            event("timeout", s.describe());
        }
        if (done) {
            s.end();
            index++;
            stepStarted = false;
            if (abortRequested) stop();
        }
        if (index >= steps.size() && background.isEmpty()) {
            if (!finished) {
                stopDrive();
                finished = true;
                event("end", "");
            }
            writeLog();
        }
    }

    public boolean isBusy() {
        return index < steps.size() || !background.isEmpty();
    }

    public void stop() {
        stopDrive();
        if (stepStarted && index < steps.size() && steps.get(index) instanceof SquareStep) setDriveMode(DcMotor.RunMode.RUN_USING_ENCODER);
        for (Background b : background) b.end.run();
        background.clear();
        if (!finished) event("stopped", "");
        index = steps.size();
        finished = true;
        writeLog();
    }

    public int currentStepIndex() {
        return index;
    }

    public int stepCount() {
        return steps.size();
    }

    public double getHeading() {
        return heading;
    }

    public double getX() {
        return poseX;
    }

    public double getY() {
        return poseY;
    }

    public void setPose(double x, double y, double headingDeg) {
        poseX = x;
        poseY = y;
        setHeadingNow(headingDeg);
        targetHeading = heading;
    }

    public boolean isImuOk() {
        return imuOk;
    }

    public int blockedCount() {
        return blocked;
    }

    public int slipCount() {
        return slipEvents;
    }

    public boolean isSlipping() {
        return slipping;
    }

    public double getSpeed() {
        return transSpeed;
    }

    public double lastWallCorrectionIn() {
        return lastSquareCorrIn;
    }

    public double lastWallCorrectionDeg() {
        return lastSquareCorrDeg;
    }

    public OverPath log(String name) {
        log = new StringBuilder(64 * 1024);
        logName = name == null || name.isEmpty() ? "run" : name.replaceAll("[^A-Za-z0-9_-]", "");
        logWritten = false;
        return this;
    }

    public String logFile() {
        return logFile;
    }

    public void track() {
        if (!started) start();
        updatePose();
        updateBackground();
    }

    public double loopHz() {
        return loopMsAvg > 0 ? 1000.0 / loopMsAvg : 0;
    }

    public double getVoltage() {
        return voltage;
    }

    public void addTelemetry(Telemetry t) {
        boolean busy = index < steps.size();
        t.addData("Path", "%d/%d %s", Math.min(index + 1, steps.size()), steps.size(),
                busy ? steps.get(index).describe() : background.isEmpty() ? "done" : "steps done");
        t.addData("Pose", "x %.1f  y %.1f  h %.1f (target %.1f)", poseX, poseY, heading, targetHeading);
        if (busy && steps.get(index) instanceof DriveToStep) {
            t.addData("Progress", "%.0f%%", ((DriveToStep) steps.get(index)).lastProgress * 100);
        }
        t.addData("Step time", "%.1f s", stepTimer.seconds());
        t.addData("IMU", imuOk ? "ok" : "NOT RESPONDING - wheel heading");
        t.addData("OverPath", VERSION);
        t.addData("Loop", Double.isNaN(voltage) ? "%.0f Hz" : "%.0f Hz   battery %.1f V", loopHz(), voltage);
        if (slipEvents > 0) t.addData("Wheel slips caught", slipEvents);
        if (!background.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            for (Background b : background) {
                if (sb.length() > 0) sb.append(", ");
                sb.append(b.label).append(String.format(Locale.US, " %.1fs left", Math.max(0, b.ms - b.timer.milliseconds()) / 1000.0));
            }
            t.addData("Background", sb.toString());
        }
        if (wallSquares > 0) t.addData("Wall squares", wallSquares);
        if (blocked > 0) t.addData("Blocked", blocked);
        if (timeouts > 0) t.addData("Timeouts", timeouts);
        if (!lastWarning.isEmpty()) t.addLine(lastWarning);
    }

    public static double profilePower(double s, double total, double power, double minPower, double rampIn) {
        double p = Math.abs(power);
        if (p <= minPower || rampIn <= 0) return p;
        double up = minPower + (p - minPower) * Math.max(0, s) / rampIn;
        double down = minPower + (p - minPower) * Math.max(0, total - s) / rampIn;
        return Math.min(p, Math.max(minPower, Math.min(up, down)));
    }

    public double stopDistanceIn(double v) {
        double s = Math.abs(v);
        return Math.max(0, brakeLinear * s + brakeQuadratic * s * s);
    }

    public static double wrap(double deg) {
        double d = deg % 360.0;
        if (d > 180) d -= 360;
        if (d <= -180) d += 360;
        return d;
    }

    private OverPath add(Step s) {
        steps.add(s);
        return this;
    }

    private double readImuYaw() {
        try {
            return imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES);
        } catch (RuntimeException e) {
            return Double.NaN;
        }
    }

    private void setHeadingNow(double h) {
        heading = wrap(h);
        if (imuOk && !Double.isNaN(lastImuYaw)) headingOffset = heading - lastImuYaw;
    }

    private void updatePose() {
        int[] now = new int[4];
        for (int i = 0; i < 4; i++) now[i] = motors[i] == null ? 0 : motors[i].getCurrentPosition();
        double dt = loopTimer.seconds();
        loopTimer.reset();
        lastDtMs = Math.max(0, Math.min(dt, 0.1)) * 1000;
        double imuYaw = imuOk ? readImuYaw() : Double.NaN;
        if (!trackerReady) {
            lastTicks = now;
            if (!Double.isNaN(imuYaw)) lastImuYaw = imuYaw;
            trackerReady = true;
            lastDtMs = 0;
            return;
        }
        if (dt <= 0) return;
        loopMsAvg = loopMsAvg <= 0 ? dt * 1000 : loopMsAvg + (dt * 1000 - loopMsAvg) * 0.05;
        readBattery();
        double tpi = k.ticksPerInch();
        double[] d = new double[4];
        for (int i = 0; i < 4; i++) d[i] = motors[i] == null ? 0 : (now[i] - lastTicks[i]) / tpi;
        double arc = drive == Drive.MECANUM
                ? (-d[0] + d[1] - d[2] + d[3]) / 4
                : ((motors[3] == null ? d[1] : (d[1] + d[3]) / 2) - (motors[2] == null ? d[0] : (d[0] + d[2]) / 2)) / 2;
        double wheelTurnDeg = Math.toDegrees(arc / turnRadiusIn);

        double newHeading;
        boolean imuGood = false;
        double imuDelta = 0;
        if (imuOk && !Double.isNaN(imuYaw)) {
            imuDelta = wrap(imuYaw - lastImuYaw);
            double wheelRate = dt > 0 ? Math.abs(wheelTurnDeg) / dt : 0;
            boolean glitch = Math.abs(imuDelta) > imuMaxJumpDeg;
            boolean frozen = wheelRate > imuFreezeDegPerSec && Math.abs(imuDelta) < 0.01;
            if (glitch || frozen) {
                freezeMs += lastDtMs;
                newHeading = wrap(heading + wheelTurnDeg);
                if (freezeMs >= imuFreezeMs) {
                    imuOk = false;
                    lastWarning = "IMU stopped responding: switched to wheel heading";
                    event("imu", "stopped responding");
                }
            } else {
                freezeMs = 0;
                imuGood = true;
                newHeading = wrap(imuYaw + headingOffset);
                lastImuYaw = imuYaw;
            }
        } else {
            imuOk = false;
            newHeading = wrap(heading + wheelTurnDeg);
        }

        double turnRad = imuGood ? Math.toRadians(imuDelta) : arc / turnRadiusIn;
        double turnPart = turnRad * turnRadiusIn;
        double dF;
        double dS;

        double[] old = slipWin[slipPos];
        double scale = lastLoopDt > 0 ? dt / lastLoopDt : 1;
        double[] seen = {d[0] + turnPart, d[1] - turnPart, d[2] + turnPart, d[3] - turnPart};
        double[] pred = {prevPlus * scale, prevMinus * scale, prevMinus * scale, prevPlus * scale};
        for (int i = 0; i < 4; i++) {
            double dev = Math.abs(seen[i] - pred[i]);
            devSum[i] += dev - slipDev[slipPos][i];
            slipDev[slipPos][i] = dev;
        }
        lastLoopDt = dt;
        for (int i = 0; i < 4; i++) winSum[i] += d[i] - old[i];
        winSum[4] += turnRad - old[4];
        winSum[5] += dt - old[5];
        old[0] = d[0]; old[1] = d[1]; old[2] = d[2]; old[3] = d[3]; old[4] = turnRad; old[5] = dt;
        slipPos = (slipPos + 1) % SLIP_WINDOW;
        double tw = winSum[4] * turnRadiusIn;
        double thr = 3.0 / tpi + slipTolInPerSec * winSum[5];
        double band = (learnRad > Math.toRadians(30) ? 0.15 : 0.5) * Math.abs(tw);
        double arcW = drive == Drive.MECANUM
                ? (-winSum[0] + winSum[1] - winSum[2] + winSum[3]) / 4
                : ((motors[3] == null ? winSum[1] : (winSum[1] + winSum[3]) / 2) - (motors[2] == null ? winSum[0] : (winSum[0] + winSum[2]) / 2)) / 2;
        boolean phantomTurn = imuGood && 2 * Math.abs(arcW - tw) > thr + 2 * band;
        boolean slipNow;
        if (drive == Drive.MECANUM) {
            double plus = (d[0] + d[3]) / 2;
            double minus = (d[1] + d[2]) / 2;
            slipNow = Math.abs(winSum[0] + winSum[1] - winSum[2] - winSum[3]) > thr || phantomTurn;
            if (slipNow && imuGood && slipCorrection) {
                double pairTol = thr + 2 * band;
                if (Math.abs((winSum[0] + tw) - (winSum[3] - tw)) > pairTol) {
                    plus = devSum[0] > devSum[3] ? seen[3] : seen[0];
                }
                if (Math.abs((winSum[1] - tw) - (winSum[2] + tw)) > pairTol) {
                    minus = devSum[2] > devSum[1] ? seen[1] : seen[2];
                }
            }
            prevPlus = plus;
            prevMinus = minus;
            dF = (plus + minus) / 2;
            dS = (plus - minus) / 2 / k.strafeMultiplier;
        } else {
            double left = motors[2] == null ? d[0] : (d[0] + d[2]) / 2;
            double right = motors[3] == null ? d[1] : (d[1] + d[3]) / 2;
            dF = (left + right) / 2;
            dS = 0;
            slipNow = phantomTurn;
        }
        if (slipNow && !slipping) {
            slipEvents++;
            event("slip", "");
        }
        slipping = slipNow;

        if (imuGood && !slipNow && Math.abs(imuDelta) > 0.2 && Math.abs(arc) > 0.01 && Math.signum(arc) == Math.signum(imuDelta)) {
            learnArcIn += Math.abs(arc);
            learnRad += Math.toRadians(Math.abs(imuDelta));
            if (learnRad > Math.toRadians(30)) turnRadiusIn = learnArcIn / learnRad;
        }
        double inst = Math.hypot(dF, dS) / dt;
        instSpeed = inst;
        transSpeed += (inst - transSpeed) * Math.min(1, dt / 0.08);

        double mid = Math.toRadians(heading + wrap(newHeading - heading) / 2);
        double fx = dF * Math.cos(mid);
        double fy = dF * Math.sin(mid);
        double sx = dS * Math.sin(mid);
        double sy = -dS * Math.cos(mid);
        poseX += fx + sx;
        poseY += fy + sy;
        double[][] parts = {{fx, sx}, {fy, sy}};
        for (int a = 0; a < 2; a++) {
            travel[a][0] += parts[a][0];
            travel[a][1] += parts[a][1];
            travel[a][2] += Math.abs(parts[a][0]);
            travel[a][3] += Math.abs(parts[a][1]);
            axisSince[a] += dt;
        }
        headingSince += dt;
        heading = newHeading;
        lastTicks = now;
    }

    private void sample() {
        if (log == null || logWritten || log.length() > 4_000_000) return;
        log.append(String.format(Locale.US, "S,%.3f,%d,%.2f,%.2f,%.1f,%.1f,%.2f,%d%n", runClock.seconds(), index, poseX, poseY, heading,
                transSpeed, voltage, slipping ? 1 : 0));
    }

    private void event(String kind, String details) {
        if (log == null || logWritten || log.length() > 4_000_000) return;
        log.append("E,").append(String.format(Locale.US, "%.3f", runClock.seconds())).append(',').append(index).append(',').append(kind)
                .append(',').append(details.replace('\n', ' ')).append('\n');
    }

    private void writeLog() {
        if (log == null || logWritten || !started) return;
        logWritten = true;
        try {
            File dir = new File(filesDir);
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("can't create " + filesDir);
            String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
            File f = new File(dir, "run-" + logName + "-" + stamp + ".csv");
            try (Writer w = new OutputStreamWriter(new FileOutputStream(f), Charset.forName("UTF-8"))) {
                w.write(log.toString());
            }
            logFile = f.getPath();
            File[] runs = dir.listFiles((d, n) -> n.startsWith("run-") && n.endsWith(".csv"));
            if (runs != null && runs.length > keepRuns) {
                Arrays.sort(runs, (x, y) -> Long.compare(x.lastModified(), y.lastModified()));
                for (int i = 0; i < runs.length - keepRuns; i++) {
                    if (!runs[i].delete()) break;
                }
            }
        } catch (IOException | RuntimeException e) {
            lastWarning = "Run log not saved: " + e.getMessage();
        }
    }

    private static String num(double v) {
        if (Double.isNaN(v)) return "NaN";
        String s = String.format(Locale.US, "%.4f", v);
        s = s.replaceAll("0+$", "");
        return s.endsWith(".") ? s.substring(0, s.length() - 1) : s;
    }

    private void readBattery() {
        if (battery == null) return;
        voltageAgeMs += lastDtMs;
        if (voltageAgeMs < 250) return;
        voltageAgeMs = 0;
        try {
            voltage = battery.getVoltage();
        } catch (RuntimeException e) {
            voltage = Double.NaN;
        }
    }

    private void updateBackground() {
        for (int i = background.size() - 1; i >= 0; i--) {
            Background b = background.get(i);
            if (b.timer.milliseconds() >= b.ms) {
                b.end.run();
                background.remove(i);
            }
        }
    }

    private void runStop(String name) {
        Runnable r = commandStops.get(name);
        if (r != null) r.run();
    }

    private void runCommand(String name) {
        Runnable r = commands.get(name);
        if (r == null) {
            lastWarning = "No command registered: " + name;
        } else {
            r.run();
        }
    }

    private void driveRobot(double f, double s, double power, double turn) {
        double sw = drive == Drive.MECANUM ? s * k.strafeMultiplier : 0;
        double m = Math.max(1e-6, Math.abs(f) + Math.abs(sw));
        double[] out = new double[4];
        double norm = 1;
        for (int i = 0; i < 4; i++) {
            out[i] = power * (f + STRAFE[i] * sw) / m + TURN[i] * turn;
            norm = Math.max(norm, Math.abs(out[i]));
        }
        for (int i = 0; i < 4; i++) out[i] /= norm;
        drivePowers(out);
    }

    private void drivePowers(double[] out) {
        double dtS = lastDtMs / 1000;
        double want = 0;
        for (double p : out) want = Math.max(want, Math.abs(p));
        double cap = Math.min(want, Math.max(0, maxDrivePower));
        if (maxPowerRatePerS > 0) cap = Math.min(cap, slewMag + maxPowerRatePerS * dtS);
        if (want > cap && want > 1e-9) {
            for (int i = 0; i < 4; i++) out[i] *= cap / want;
        }
        double mag = Math.min(want, cap);
        double floor = maxPowerDropPerS > 0 ? slewMag - maxPowerDropPerS * dtS : 0;
        if (mag < floor) {
            if (mag > 1e-9) {
                for (int i = 0; i < 4; i++) out[i] *= floor / mag;
            } else {
                for (int i = 0; i < 4; i++) out[i] = lastOut[i] * floor / slewMag;
            }
            mag = floor;
        }
        slewMag = mag;
        System.arraycopy(out, 0, lastOut, 0, 4);
        setPowers(out);
    }

    private void softStop() {
        drivePowers(new double[4]);
    }

    private double holdHeading() {
        return clip(headingKp * wrap(targetHeading - heading), maxHeadingCorrection);
    }

    private static double clip(double v, double max) {
        return Math.max(-max, Math.min(max, v));
    }

    private void setDriveMode(DcMotor.RunMode mode) {
        for (DcMotor m : motors) if (m != null) m.setMode(mode);
    }

    private void setPowers(double[] p) {
        for (int i = 0; i < 4; i++) {
            if (motors[i] == null) continue;
            double last = lastPower[i];
            if (Double.isNaN(last) || Math.abs(p[i] - last) >= 0.005 || (p[i] == 0 && last != 0)) {
                motors[i].setPower(p[i]);
                lastPower[i] = p[i];
            }
        }
    }

    private void stopDrive() {
        slewMag = 0;
        setPowers(new double[4]);
    }

    private static String fmt(double v) {
        return String.format(Locale.US, "%.2f", v);
    }

    private class StallWatch {
        double armedMs;
        double slowMs;

        void reset() {
            armedMs = 0;
            slowMs = 0;
        }

        boolean stalled() {
            armedMs += lastDtMs;
            if (transSpeed < stallInPerSec) slowMs += lastDtMs;
            else slowMs = 0;
            return armedMs >= stallArmMs && slowMs >= stallMs;
        }
    }

    private abstract static class Step {
        long timeoutMs = -1;

        void start() {}

        abstract boolean run();

        void end() {}

        long defaultTimeoutMs() {
            return 0;
        }

        abstract String describe();
    }

    private static class Marker {
        final double t;
        final Runnable action;

        Marker(double t, Runnable action) {
            this.t = t;
            this.action = action;
        }
    }

    private class DriveToStep extends Step {
        double tx;
        double ty;
        final double power;
        boolean reversed;
        final boolean relative;
        final double relF;
        final double relS;
        final List<Marker> markers = new ArrayList<Marker>();
        final StallWatch watch = new StallWatch();
        double sx;
        double sy;
        double ux;
        double uy;
        double len;
        double lastProgress;
        int nextMarker;
        boolean retried;
        double pauseMs = -1;
        boolean settle;
        boolean corner;
        int phase;
        double settleT;
        int corrections;
        double cdx;
        double cdy;
        double cutX;
        double cutY;
        double cutV;

        DriveToStep(double x, double y, double power, boolean relative, double f, double s) {
            this.tx = x;
            this.ty = y;
            this.power = Math.abs(power);
            this.relative = relative;
            this.relF = f;
            this.relS = s;
        }

        @Override void start() {
            if (relative) {
                double h = Math.toRadians(targetHeading);
                tx = poseX + relF * Math.cos(h) + relS * Math.sin(h);
                ty = poseY + relF * Math.sin(h) - relS * Math.cos(h);
            }
            sx = poseX;
            sy = poseY;
            len = Math.hypot(tx - sx, ty - sy);
            ux = len > 1e-9 ? (tx - sx) / len : 0;
            uy = len > 1e-9 ? (ty - sy) / len : 0;
            nextMarker = 0;
            lastProgress = 0;
            retried = false;
            pauseMs = -1;
            watch.reset();
            int me = steps.indexOf(this);
            boolean driveNext = me + 1 < steps.size() && steps.get(me + 1) instanceof DriveToStep;
            boolean relativeNext = driveNext && ((DriveToStep) steps.get(me + 1)).relative;
            settle = settleCorrections > 0 && (!driveNext || relativeNext);
            corner = driveNext && !settle && !flowsInto(me + 1);
            phase = 0;
            corrections = 0;
            cutV = 0;
        }

        @Override boolean run() {
            if (len < 0.05) return true;
            double ex = tx - poseX;
            double ey = ty - poseY;
            double remaining = Math.hypot(ex, ey);
            double along = (poseX - sx) * ux + (poseY - sy) * uy;
            lastProgress = Math.min(1, along / len);
            fireMarkers(lastProgress);
            if (phase == 1) {
                softStop();
                settleT += lastDtMs;
                if ((transSpeed > finishSpeedInPerSec || slewMag > 0) && settleT < 600) return false;
                learnCoast();
                if (corner) return true;
                if (remaining <= posTolIn || corrections >= settleCorrections) return true;
                corrections++;
                cdx = ex;
                cdy = ey;
                phase = 2;
            }
            if (phase == 2) {
                if (ex * cdx + ey * cdy <= 0 || remaining <= Math.max(posTolIn * 0.5, stopDistanceIn(transSpeed))) {
                    cut();
                    return false;
                }
                correct(ex, ey);
                return false;
            }
            double rollIn = settle || corner ? stopDistanceIn(transSpeed) : 0;
            if (remaining <= Math.max(posTolIn, rollIn) || along >= len) {
                if (!settle && !corner) return true;
                cut();
                return false;
            }

            if (pauseMs >= 0) {
                stopDrive();
                pauseMs += lastDtMs;
                if (pauseMs < 300) return false;
                pauseMs = -1;
                watch.reset();
            }
            if (watch.stalled() && remaining > blockedTolIn) {
                blocked++;
                if (onBlocked == OnBlocked.RETRY_ONCE && !retried) {
                    retried = true;
                    pauseMs = 0;
                    lastWarning = "Blocked at step " + (index + 1) + ", retrying";
                    return false;
                }
                lastWarning = "Blocked at step " + (index + 1) + " (" + describe() + ")";
                event("blocked", describe());
                if (onBlocked == OnBlocked.ABORT) abortRequested = true;
                return true;
            }

            double p = profilePower(len - remaining, len, power, minPower, rampIn);
            if (drive == Drive.MECANUM) {
                double h = Math.toRadians(heading);
                double f = ex * Math.cos(h) + ey * Math.sin(h);
                double s = ex * Math.sin(h) - ey * Math.cos(h);
                driveRobot(f, s, p, holdHeading());
            } else {
                if (remaining > 2.0) {
                    double aim = Math.toDegrees(Math.atan2(ey, ex)) + (reversed ? 180 : 0);
                    targetHeading = wrap(aim);
                }
                double err = wrap(targetHeading - heading);
                double fwd = Math.max(0, Math.cos(Math.toRadians(err))) * (reversed ? -1 : 1);
                driveRobot(fwd, 0, p * Math.abs(fwd), holdHeading());
            }
            return false;
        }

        boolean flowsInto(int next) {
            if (abortRequested || next >= steps.size() || !(steps.get(next) instanceof DriveToStep)) return false;
            DriveToStep n = (DriveToStep) steps.get(next);
            if (n.relative || len < 1e-6) return false;
            double nx = n.tx - tx;
            double ny = n.ty - ty;
            double nl = Math.hypot(nx, ny);
            return nl > 1e-6 && (nx * ux + ny * uy) / nl >= Math.cos(Math.toRadians(30));
        }

        void cut() {
            phase = 1;
            settleT = 0;
            cutX = poseX;
            cutY = poseY;
            cutV = transSpeed;
            softStop();
        }

        void learnCoast() {
            double v = cutV;
            cutV = 0;
            if (!learnBrake || v < 3 || transSpeed > finishSpeedInPerSec) return;
            double rolled = Math.hypot(poseX - cutX, poseY - cutY);
            double lin = (rolled - brakeQuadratic * v * v) / v;
            double rate = coastSamples < 3 ? 0.6 : 0.3;
            coastSamples++;
            brakeLinear = Math.max(0.01, Math.min(0.4, brakeLinear + (lin - brakeLinear) * rate));
        }

        void correct(double ex, double ey) {
            double p = Math.min(Math.max(power, minPower), minPower + correctionKSq * Math.sqrt(Math.hypot(ex, ey)));
            double h = Math.toRadians(heading);
            if (drive == Drive.MECANUM) {
                driveRobot(ex * Math.cos(h) + ey * Math.sin(h), ex * Math.sin(h) - ey * Math.cos(h), p, holdHeading());
            } else {
                double alongHeading = ex * Math.cos(h) + ey * Math.sin(h);
                driveRobot(Math.signum(alongHeading), 0, p, holdHeading());
            }
        }

        void fireMarkers(double prog) {
            while (nextMarker < markers.size() && prog >= markers.get(nextMarker).t) {
                markers.get(nextMarker++).action.run();
            }
        }

        @Override void end() {
            if (!flowsInto(steps.indexOf(this) + 1)) stopDrive();
            fireMarkers(Double.POSITIVE_INFINITY);
        }

        @Override long defaultTimeoutMs() {
            double speed = timeoutSpeedInPerSec * Math.max(power, minPower);
            return 1000 + (long) (1000 * len / Math.max(1e-3, speed)) + (onBlocked == OnBlocked.RETRY_ONCE ? 600 : 0)
                    + (settle ? 1200L * settleCorrections : 0);
        }

        @Override String describe() {
            if (!relative) return "driveTo (" + fmt(tx) + ", " + fmt(ty) + ")";
            if (relS == 0) return "drive " + fmt(relF) + " in";
            if (relF == 0) return "strafe " + fmt(relS) + " in";
            return "vector " + fmt(relF) + "/" + fmt(relS) + " in";
        }
    }

    private class TurnStep extends Step {
        final double amount;
        final boolean relative;
        final double power;
        double goal;
        double inTolSinceMs;

        TurnStep(double amount, boolean relative, double power) {
            this.amount = amount;
            this.relative = relative;
            this.power = Math.abs(power);
        }

        @Override void start() {
            goal = relative ? wrap(targetHeading + amount) : wrap(amount);
            targetHeading = goal;
            inTolSinceMs = -1;
            if (Math.abs(wrap(goal - heading)) > 5) {
                turnsSince[0]++;
                turnsSince[1]++;
                turnsSinceHeading++;
            }
        }

        @Override boolean run() {
            double err = wrap(goal - heading);
            if (Math.abs(err) <= turnTolDeg) {
                stopDrive();
                if (inTolSinceMs < 0) inTolSinceMs = stepTimer.milliseconds();
                return stepTimer.milliseconds() - inTolSinceMs >= settleMs;
            }
            inTolSinceMs = -1;
            double floor = Math.min(turnMinPower, power);
            double p = Math.max(-power, Math.min(power, turnKp * err));
            if (Math.abs(p) < floor) p = Math.signum(err) * floor;
            double[] out = new double[4];
            for (int i = 0; i < 4; i++) out[i] = TURN[i] * p;
            drivePowers(out);
            return false;
        }

        @Override void end() {
            stopDrive();
        }

        @Override long defaultTimeoutMs() {
            return turnTimeoutMs;
        }

        @Override String describe() {
            return (relative ? "turn by " : "turn to ") + fmt(amount) + " deg";
        }
    }

    private class SquareStep extends Step {
        final Wall wall;
        final Face face;
        final double power;
        final boolean align;
        final StallWatch watch = new StallWatch();
        int phase;
        double settleMs;
        double peak;
        double backX;
        double backY;

        SquareStep(Wall wall, Face face, double power, boolean align) {
            this.wall = wall;
            this.face = face;
            this.power = Math.abs(power);
            this.align = align;
        }

        double faceF() {
            return face == Face.FRONT ? 1 : face == Face.BACK ? -1 : 0;
        }

        double faceS() {
            return face == Face.RIGHT ? 1 : face == Face.LEFT ? -1 : 0;
        }

        double faceAngle() {
            return face == Face.FRONT ? 0 : face == Face.LEFT ? 90 : face == Face.BACK ? 180 : -90;
        }

        double wallAngle() {
            return wall == Wall.RIGHT ? 0 : wall == Wall.AUDIENCE ? 90 : wall == Wall.LEFT ? 180 : -90;
        }

        double halfExtent() {
            return (face == Face.FRONT || face == Face.BACK ? robotLengthIn : robotWidthIn) / 2;
        }

        double gap() {
            double a = Math.toRadians(wallAngle());
            return HALF_FIELD - (poseX * Math.cos(a) + poseY * Math.sin(a)) - halfExtent();
        }

        @Override void start() {
            phase = 0;
            settleMs = 0;
            peak = 0;
            contactAlong = Double.NaN;
            histPos = 0;
            watch.reset();
            setDriveMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
        }

        @Override boolean run() {
            if (phase == 0) {
                peak = Math.max(peak, transSpeed);
                boolean moving = stepTimer.milliseconds() < stallArmMs || transSpeed > 0.5 * peak;
                double na = Math.toRadians(wallAngle());
                histAlong[histPos % HIST] = poseX * Math.cos(na) + poseY * Math.sin(na);
                histSpeed[histPos % HIST] = instSpeed;
                histPos++;
                driveRobot(faceF(), faceS(), power, moving && gap() > 1 ? holdHeading() : 0);
                boolean stalled = watch.stalled();
                if (stalled || gap() < -wallOvershootIn) {
                    phase = 1;
                    contactAlong = stalled ? impactAlong() : Double.NaN;
                    if (!stalled) lastWarning = "Step " + (index + 1) + ": wheels spun at the wall (re-zeroed anyway)";
                }
                return false;
            }
            if (phase == 1) {
                driveRobot(faceF(), faceS(), power, 0);
                settleMs += lastDtMs;
                if (settleMs < squareSettleMs) return false;
                snap();
                phase = 2;
                backX = poseX;
                backY = poseY;
                if (backOffIn <= 0) return true;
            }
            driveRobot(-faceF(), -faceS(), Math.max(minPower, power * 0.6), holdHeading());
            return Math.hypot(poseX - backX, poseY - backY) >= backOffIn;
        }

        double contactAlong;
        static final int HIST = 48;
        final double[] histAlong = new double[HIST];
        final double[] histSpeed = new double[HIST];
        int histPos;

        double impactAlong() {
            int n = Math.min(histPos, HIST);
            int first = histPos - n;
            double[] sorted = new double[n];
            for (int i = 0; i < n; i++) sorted[i] = histSpeed[(first + i) % HIST];
            Arrays.sort(sorted);
            double approach = n > 0 ? sorted[(int) (0.75 * (n - 1))] : 0;
            for (int i = 0; i + 2 < n; i++) {
                boolean slow = true;
                for (int j = 0; j < 3; j++) slow &= histSpeed[(first + i + j) % HIST] < 0.6 * approach;
                if (slow) return histAlong[(first + Math.max(0, i - 1)) % HIST];
            }
            return n > 0 ? histAlong[(histPos - 1) % HIST] : Double.NaN;
        }

        void snap() {
            double a = Math.toRadians(wallAngle());
            double c = HALF_FIELD - halfExtent();
            double before = contactAlong;
            if (Math.abs(Math.cos(a)) > 0.5) poseX = Math.signum(Math.cos(a)) * c;
            else poseY = Math.signum(Math.sin(a)) * c;
            lastSquareCorrIn = (poseX * Math.cos(a) + poseY * Math.sin(a)) - before;
            lastSquareCorrDeg = Double.NaN;
            if (align) {
                double h0 = heading;
                setHeadingNow(wallAngle() - faceAngle());
                targetHeading = heading;
                lastSquareCorrDeg = wrap(heading - h0);
            }
            wallSquares++;
            int axis = Math.abs(Math.cos(a)) > 0.5 ? 0 : 1;
            double sign = axis == 0 ? Math.signum(Math.cos(a)) : Math.signum(Math.sin(a));
            event("wall", wall.name() + "," + face.name() + "," + num(lastSquareCorrIn) + "," + num(lastSquareCorrDeg) + ","
                    + num(sign * travel[axis][0]) + "," + num(sign * travel[axis][1]) + "," + num(travel[axis][2]) + "," + num(travel[axis][3]) + ","
                    + turnsSince[axis] + "," + num(axisSince[axis]) + "," + (align ? turnsSinceHeading + "," + num(headingSince) : "0,0"));
            Arrays.fill(travel[axis], 0);
            turnsSince[axis] = 0;
            axisSince[axis] = 0;
            if (align) {
                turnsSinceHeading = 0;
                headingSince = 0;
            }
        }

        @Override void end() {
            stopDrive();
            setDriveMode(DcMotor.RunMode.RUN_USING_ENCODER);
            if (phase == 0) lastWarning = "Step " + (index + 1) + ": wall not reached, position not re-zeroed";
        }

        @Override long defaultTimeoutMs() {
            return squareTimeoutMs;
        }

        @Override String describe() {
            return "square " + face.name().toLowerCase(Locale.US) + " to " + wall.name().toLowerCase(Locale.US) + " wall";
        }
    }

    private class WaitStep extends Step {
        final long ms;

        WaitStep(long ms) {
            this.ms = ms;
        }

        @Override boolean run() {
            return stepTimer.milliseconds() >= ms;
        }

        @Override String describe() {
            return "wait " + ms + " ms";
        }
    }

    private class TimedStep extends Step {
        final String label;
        final long ms;
        final Runnable startAction;
        final Runnable endAction;

        TimedStep(String label, long ms, Runnable startAction, Runnable endAction) {
            this.label = label;
            this.ms = ms;
            this.startAction = startAction;
            this.endAction = endAction;
        }

        @Override void start() {
            startAction.run();
        }

        @Override boolean run() {
            return stepTimer.milliseconds() >= ms;
        }

        @Override void end() {
            endAction.run();
        }

        @Override String describe() {
            return label;
        }
    }

    private static class Background {
        final String label;
        final long ms;
        final Runnable end;
        final ElapsedTime timer = new ElapsedTime();

        Background(String label, long ms, Runnable end) {
            this.label = label;
            this.ms = ms;
            this.end = end;
        }
    }

    private class InstantStep extends Step {
        final String label;
        final Runnable action;

        InstantStep(String label, Runnable action) {
            this.label = label;
            this.action = action;
        }

        @Override void start() {
            action.run();
        }

        @Override boolean run() {
            return true;
        }

        @Override String describe() {
            return label;
        }
    }
}
