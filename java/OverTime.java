package org.firstinspires.ftc.teamcode.overtime;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.IMU;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.hardware.VoltageSensor;
import com.qualcomm.robotcore.util.ElapsedTime;

import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

public class OverTime {
    public static final String VERSION = "1.3.0";

    public enum Face {
        FRONT(0), BACK(180), LEFT(90), RIGHT(-90);
        public final double dirDeg;

        Face(double dirDeg) {
            this.dirDeg = dirDeg;
        }
    }

    public static class Constants {
        public double refVoltage = 12.8;
        public double maxVoltageScale = 1.25;
        public double minVoltageScale = 0.8;
        public long rampMs = 150;
        public double headingKp = 0.02;
        public double headingKi = 0.02;
        public double maxHeadingIntegral = 0.15;
        public double maxHeadingPower = 0.3;
        public double turnKp = 0.012;
        public double turnMinPower = 0.12;
        public double turnTolDeg = 1.5;
        public long turnSettleMs = 100;
        public long turnTimeoutMs = 2500;
        public long squareMs = 400;
        public long backOffMs = 150;
        public double backOffPower = 0.3;
        public long autoLimitMs = 30000;
    }

    private final LinearOpMode opMode;
    private final DcMotor frontLeft;
    private final DcMotor frontRight;
    private final DcMotor backLeft;
    private final DcMotor backRight;
    private final IMU imu;
    private final Constants constants;
    private final ElapsedTime autoTimer = new ElapsedTime();
    private final ElapsedTime stepTimer = new ElapsedTime();
    private final ElapsedTime telemetryTimer = new ElapsedTime();
    private final ElapsedTime clock = new ElapsedTime();
    private final Map<String, Runnable> commands = new HashMap<String, Runnable>();
    private final List<Later> later = new ArrayList<Later>();
    private Runnable everyLoop = null;

    private static class Later {
        final Object key;
        final double atMs;
        final Runnable action;

        Later(Object key, double atMs, Runnable action) {
            this.key = key;
            this.atMs = atMs;
            this.action = action;
        }
    }

    private double headingOffset = 0;
    private double targetHeading = 0;
    private double lastScale = 1;
    private double lastVoltage = 0;
    private String stepName = "init";
    private boolean begun = false;

    public OverTime(LinearOpMode opMode, DcMotor frontLeft, DcMotor frontRight, DcMotor backLeft, DcMotor backRight,
                    IMU imu, Constants constants) {
        if (opMode == null || frontLeft == null || frontRight == null || backLeft == null || backRight == null || imu == null) {
            throw new IllegalArgumentException("OverTime: the OpMode, four drive motors and the IMU are required");
        }
        this.opMode = opMode;
        this.frontLeft = frontLeft;
        this.frontRight = frontRight;
        this.backLeft = backLeft;
        this.backRight = backRight;
        this.imu = imu;
        this.constants = constants != null ? constants : new Constants();
        for (DcMotor m : new DcMotor[] {frontLeft, frontRight, backLeft, backRight}) {
            m.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
            m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
            m.setPower(0);
        }
    }

    public OverTime registerCommand(String name, Runnable action) {
        commands.put(name, action);
        return this;
    }

    public OverTime onLoop(Runnable action) {
        everyLoop = action;
        return this;
    }

    public void showInit() {
        double v = batteryVoltage();
        opMode.telemetry.addData("OverTime", "v%s ready", VERSION);
        opMode.telemetry.addData("Battery", "%.2f V (calibrated at %.2f V)", v, constants.refVoltage);
        if (constants.refVoltage > 0 && v > 0 && v < constants.refVoltage - 0.8) {
            opMode.telemetry.addLine("Battery is low: distances can come out short. Swap it if you can.");
        }
        opMode.telemetry.update();
    }

    public OverTime begin(double startHeadingDeg) {
        imu.resetYaw();
        headingOffset = startHeadingDeg - readYaw();
        targetHeading = wrap(startHeadingDeg);
        autoTimer.reset();
        begun = true;
        return this;
    }

    public OverTime drive(double dirDeg, double power, long ms) {
        if (!canRun("drive")) return this;
        double scale = voltageScale();
        resetHold();
        stepTimer.reset();
        while (active()) {
            double t = stepTimer.milliseconds();
            if (t >= ms) break;
            double ramp = constants.rampMs > 0 ? clamp(Math.min(t, ms - t) / constants.rampMs, 0, 1) : 1;
            double turn = holdPower(t);
            setDrive(dirDeg, power * scale * ramp, ramp > 0 ? turn : 0);
            loopTelemetry();
            opMode.idle();
        }
        stopDrive();
        return this;
    }

    public OverTime turnTo(double headingDeg, double power) {
        if (!canRun("turn")) return this;
        targetHeading = wrap(headingDeg);
        double scale = voltageScale();
        stepTimer.reset();
        double inTolSince = -1;
        while (active() && stepTimer.milliseconds() < constants.turnTimeoutMs) {
            double err = wrap(targetHeading - heading());
            double t = stepTimer.milliseconds();
            if (Math.abs(err) <= constants.turnTolDeg) {
                stopDrive();
                if (inTolSince < 0) inTolSince = t;
                if (t - inTolSince >= constants.turnSettleMs) break;
            } else {
                inTolSince = -1;
                double p = Math.max(constants.turnMinPower, Math.min(power * scale, constants.turnKp * Math.abs(err)));
                setDrive(0, 0, Math.signum(err) * p);
            }
            loopTelemetry();
            opMode.idle();
        }
        stopDrive();
        return this;
    }

    public OverTime pushWall(Face face, double power, long ms, boolean alignHeading) {
        if (!canRun("wall " + face)) return this;
        double scale = voltageScale();
        long holdMs = Math.max(0, ms - constants.squareMs);
        resetHold();
        stepTimer.reset();
        while (active()) {
            double t = stepTimer.milliseconds();
            if (t >= ms) break;
            double ramp = constants.rampMs > 0 ? clamp(t / constants.rampMs, 0, 1) : 1;
            double turn = t < holdMs ? holdPower(t) : 0;
            setDrive(face.dirDeg, power * scale * ramp, turn);
            loopTelemetry();
            opMode.idle();
        }
        stopDrive();
        if (alignHeading && active()) {
            double squared = Math.round(heading() / 90.0) * 90.0;
            headingOffset += wrap(squared - heading());
            targetHeading = wrap(squared);
        }
        if (constants.backOffMs > 0) {
            stepName = "back off";
            drive(face.dirDeg + 180, constants.backOffPower, constants.backOffMs);
        }
        return this;
    }

    public OverTime waitMs(long ms) {
        if (!canRun("wait")) return this;
        stepTimer.reset();
        while (active() && stepTimer.milliseconds() < ms) {
            loopTelemetry();
            opMode.idle();
        }
        return this;
    }

    public OverTime servo(Servo servo, double position) {
        if (!canRun("servo")) return this;
        servo.setPosition(position);
        return this;
    }

    public OverTime motor(DcMotorSimple motor, double power, long ms) {
        if (!canRun("motor")) return this;
        cancelLater(motor);
        motor.setPower(power);
        if (ms > 0) {
            waitMs(ms);
            motor.setPower(0);
        }
        return this;
    }

    public OverTime command(String name, long ms) {
        if (!canRun("command " + name)) return this;
        runCommand(name);
        if (ms > 0) waitMs(ms);
        return this;
    }

    public OverTime startMotor(final DcMotorSimple motor, double power, long ms) {
        if (!canRun("start motor")) return this;
        cancelLater(motor);
        motor.setPower(power);
        if (ms > 0) {
            later.add(new Later(motor, clock.milliseconds() + ms, new Runnable() {
                public void run() {
                    motor.setPower(0);
                }
            }));
        }
        return this;
    }

    public OverTime startCommand(String name, long ms, final String thenName) {
        if (!canRun("start " + name)) return this;
        cancelLater(name);
        runCommand(name);
        if (ms > 0 && thenName != null && !thenName.isEmpty()) {
            later.add(new Later(name, clock.milliseconds() + ms, new Runnable() {
                public void run() {
                    runCommand(thenName);
                }
            }));
        }
        return this;
    }

    public int pendingActions() {
        return later.size();
    }

    public OverTime stop() {
        finishLater();
        stopDrive();
        stepName = "done";
        sendTelemetry();
        return this;
    }

    public double spinTest(double power, long ms) {
        stepName = "spin test";
        stepTimer.reset();
        boolean measuring = false;
        double startT = 0;
        double endT = 0;
        double total = 0;
        double last = heading();
        while (active() && stepTimer.milliseconds() < ms) {
            double t = stepTimer.milliseconds();
            setDrive(0, 0, power);
            double h = heading();
            if (t >= ms * 0.25 && t <= ms * 0.75) {
                if (!measuring) {
                    measuring = true;
                    startT = t;
                } else {
                    total += wrap(h - last);
                }
                endT = t;
            }
            last = h;
            opMode.idle();
        }
        stopDrive();
        double dt = (endT - startT) / 1000.0;
        return dt > 0 ? Math.abs(total) / dt : 0;
    }

    public double heading() {
        return wrap(readYaw() + headingOffset);
    }

    public double autoSeconds() {
        return begun ? autoTimer.seconds() : 0;
    }

    public double lastVoltageScale() {
        return lastScale;
    }

    public double batteryVoltage() {
        double v = Double.MAX_VALUE;
        for (VoltageSensor s : opMode.hardwareMap.getAll(VoltageSensor.class)) {
            double x = s.getVoltage();
            if (x > 0) v = Math.min(v, x);
        }
        lastVoltage = v == Double.MAX_VALUE ? 0 : v;
        return lastVoltage;
    }

    private void runCommand(String name) {
        Runnable r = commands.get(name);
        if (r == null) {
            opMode.telemetry.addLine("OverTime: command '" + name + "' is not registered (runner.registerCommand)");
            opMode.telemetry.update();
        } else {
            r.run();
        }
    }

    private void cancelLater(Object key) {
        Iterator<Later> it = later.iterator();
        while (it.hasNext()) {
            if (it.next().key.equals(key)) it.remove();
        }
    }

    private void runDueLater() {
        if (later.isEmpty()) return;
        double now = clock.milliseconds();
        List<Later> due = new ArrayList<Later>();
        Iterator<Later> it = later.iterator();
        while (it.hasNext()) {
            Later l = it.next();
            if (l.atMs <= now) {
                due.add(l);
                it.remove();
            }
        }
        for (Later l : due) l.action.run();
    }

    private void finishLater() {
        List<Later> all = new ArrayList<Later>(later);
        later.clear();
        for (Later l : all) l.action.run();
    }

    private boolean canRun(String name) {
        stepName = name;
        runDueLater();
        return active();
    }

    private boolean active() {
        if (!opMode.opModeIsActive()) return false;
        return !begun || constants.autoLimitMs <= 0 || autoTimer.milliseconds() < constants.autoLimitMs;
    }

    private double voltageScale() {
        double v = batteryVoltage();
        lastScale = constants.refVoltage > 0 && v > 0 ? clamp(constants.refVoltage / v, constants.minVoltageScale, constants.maxVoltageScale) : 1;
        return lastScale;
    }

    private void setDrive(double dirDeg, double power, double turn) {
        double r = Math.toRadians(dirDeg);
        double cs = Math.cos(r);
        double sn = Math.sin(r);
        double n = Math.abs(cs) + Math.abs(sn);
        if (n < 1e-9) n = 1;
        double a = (cs - sn) / n * power;
        double b = (cs + sn) / n * power;
        double fl = a - turn;
        double fr = b + turn;
        double bl = b - turn;
        double br = a + turn;
        double max = Math.max(1, Math.max(Math.max(Math.abs(fl), Math.abs(fr)), Math.max(Math.abs(bl), Math.abs(br))));
        frontLeft.setPower(fl / max);
        frontRight.setPower(fr / max);
        backLeft.setPower(bl / max);
        backRight.setPower(br / max);
    }

    private double holdIntegral = 0;
    private double holdLastT = 0;

    private void resetHold() {
        holdIntegral = 0;
        holdLastT = 0;
    }

    private double holdPower(double t) {
        double err = wrap(targetHeading - heading());
        double dt = Math.max(0, t - holdLastT) / 1000.0;
        holdLastT = t;
        if (constants.headingKi > 0) {
            double cap = constants.maxHeadingIntegral / constants.headingKi;
            holdIntegral = clamp(holdIntegral + err * dt, -cap, cap);
        }
        return clamp(constants.headingKp * err + constants.headingKi * holdIntegral, -constants.maxHeadingPower, constants.maxHeadingPower);
    }

    private void stopDrive() {
        frontLeft.setPower(0);
        frontRight.setPower(0);
        backLeft.setPower(0);
        backRight.setPower(0);
    }

    private double readYaw() {
        return imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES);
    }

    private void loopTelemetry() {
        runDueLater();
        if (everyLoop != null) everyLoop.run();
        if (telemetryTimer.milliseconds() < 100) return;
        telemetryTimer.reset();
        sendTelemetry();
    }

    private void sendTelemetry() {
        opMode.telemetry.addData("Step", "%s  (%.1f s)", stepName, autoSeconds());
        opMode.telemetry.addData("Heading", "%.1f° (target %.1f°)", heading(), targetHeading);
        opMode.telemetry.addData("Battery", "%.2f V  power x%.2f", lastVoltage, lastScale);
        opMode.telemetry.update();
    }

    static double wrap(double deg) {
        double d = ((deg + 180) % 360 + 360) % 360 - 180;
        return d == -180 ? 180 : d;
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
