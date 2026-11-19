import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.IMU;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.hardware.VoltageSensor;
import com.qualcomm.robotcore.util.ElapsedTime;

import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;
import org.firstinspires.ftc.teamcode.overtime.OverTime;

public class Harness {
    static int fails = 0;

    static void check(boolean ok, String name, String detail) {
        System.out.println((ok ? "PASS " : "FAIL ") + name + (detail.isEmpty() ? "" : "  (" + detail + ")"));
        if (!ok) fails++;
    }

    static double wrap(double d) {
        double r = ((d + 180) % 360 + 360) % 360 - 180;
        return r == -180 ? 180 : r;
    }

    static class Motor implements DcMotor {
        double power;
        double peak;
        RunMode mode;
        ZeroPowerBehavior zpb;

        public void setMode(RunMode m) { mode = m; }
        public void setZeroPowerBehavior(ZeroPowerBehavior z) { zpb = z; }
        public int getCurrentPosition() { return 0; }
        public void setDirection(Direction d) { }
        public void setPower(double p) { power = p; peak = Math.max(peak, Math.abs(p)); }
        public double getPower() { return power; }
    }

    static class FakeServo implements Servo {
        double pos = -1;
        public void setPosition(double p) { pos = p; }
        public double getPosition() { return pos; }
    }

    static class Battery implements VoltageSensor {
        double volts = 12.8;
        public double getVoltage() { return volts; }
    }

    static class Tel implements Telemetry {
        public Object addData(String c, String f, Object... a) { String.format(f, a); return null; }
        public Object addData(String c, Object v) { return null; }
        public Object addLine(String l) { return null; }
        public boolean update() { return true; }
    }

    static class Plant {
        final Motor fl = new Motor(), fr = new Motor(), bl = new Motor(), br = new Motor();
        final Battery battery = new Battery();
        double x, y, heading;
        double speed = 80, spin = 300;
        double drift = 0;
        double wallX = Double.NaN;
        boolean pressed = false;
        double driveMs = 0;

        void step(double dtMs) {
            double dt = dtMs / 1000.0;
            double k = battery.volts / 12.8;
            double f = speed * k * (fl.power + fr.power + bl.power + br.power) / 4;
            double l = speed * k * (-fl.power + fr.power + bl.power - br.power) / 4;
            double w = spin * k * (-fl.power + fr.power - bl.power + br.power) / 4;
            boolean moving = Math.abs(f) + Math.abs(l) + Math.abs(w) > 1e-9;
            if (moving) driveMs += dtMs;
            heading = wrap(heading + (w + (moving ? drift : 0)) * dt);
            double h = Math.toRadians(heading);
            x += (f * Math.cos(h) - l * Math.sin(h)) * dt;
            y += (f * Math.sin(h) + l * Math.cos(h)) * dt;
            pressed = false;
            if (!Double.isNaN(wallX) && x >= wallX) {
                x = wallX;
                double into = -(f * Math.cos(h) - l * Math.sin(h));
                if (into < 0) {
                    pressed = true;
                    double err = wrap(180 - heading);
                    heading = wrap(heading + Math.signum(err) * Math.min(Math.abs(err), 40 * dt) - w * dt * 0.8);
                }
            }
        }

        boolean stopped() {
            return fl.power == 0 && fr.power == 0 && bl.power == 0 && br.power == 0;
        }
    }

    static class FakeImu implements IMU {
        final Plant p;
        double zero = 0;
        double bias = 0;

        FakeImu(Plant p) { this.p = p; }
        public boolean initialize(Parameters params) { return true; }
        public void resetYaw() { zero = p.heading + bias; }
        public YawPitchRollAngles getRobotYawPitchRollAngles() { return new YawPitchRollAngles(wrap(p.heading + bias - zero)); }
    }

    static class Op extends LinearOpMode {
        final Plant p;
        long nowMs = 0;
        long stopAtMs = Long.MAX_VALUE;

        Op(Plant p) {
            this.p = p;
            telemetry = new Tel();
            hardwareMap = new com.qualcomm.robotcore.hardware.HardwareMap();
            hardwareMap.devices.put("Control Hub", p.battery);
        }

        public void runOpMode() { }

        @Override
        public boolean opModeIsActive() { return nowMs < stopAtMs; }

        @Override
        public void idle() {
            p.step(10);
            nowMs += 10;
            ElapsedTime.fakeNanos += 10_000_000L;
        }
    }

    static class Rig {
        final Plant p = new Plant();
        final FakeImu imu = new FakeImu(p);
        final Op op = new Op(p);
        final OverTime.Constants c = new OverTime.Constants();
        OverTime runner;

        Rig start(double heading) {
            p.heading = heading;
            runner = new OverTime(op, p.fl, p.fr, p.bl, p.br, imu, c);
            runner.begin(heading);
            return this;
        }
    }

    static double dist(Rig r, double x0, double y0) {
        return Math.hypot(r.p.x - x0, r.p.y - y0);
    }

    public static void main(String[] args) {
        Rig r0 = new Rig().start(0);
        check(r0.p.fl.mode == DcMotor.RunMode.RUN_WITHOUT_ENCODER && r0.p.br.zpb == DcMotor.ZeroPowerBehavior.BRAKE,
                "motors run without encoders, brake on stop", "");

        Rig r1 = new Rig().start(0);
        long t0 = r1.op.nowMs;
        r1.runner.drive(0, 0.5, 1000);
        long took = r1.op.nowMs - t0;
        check(Math.abs(took - 1000) <= 20, "drive(…, 1000 ms) takes 1000 ms", took + " ms");
        check(Math.abs(r1.p.fl.peak - 0.5) < 0.01 && Math.abs(r1.p.br.peak - 0.5) < 0.01, "peak wheel power = power at the reference voltage", String.format("%.3f", r1.p.fl.peak));
        check(r1.p.stopped(), "motors stop after a drive", "");
        check(r1.p.x > 25 && Math.abs(r1.p.y) < 0.5, "forward drives forward and straight", String.format("x %.1f y %.2f", r1.p.x, r1.p.y));

        Rig r2 = new Rig().start(0);
        r2.runner.drive(90, 0.5, 800);
        check(r2.p.y > 15 && Math.abs(r2.p.x) < 0.5, "dir 90 strafes left", String.format("x %.2f y %.1f", r2.p.x, r2.p.y));
        Rig r2b = new Rig().start(0);
        r2b.runner.drive(-135, 0.5, 800);
        check(r2b.p.x < -5 && r2b.p.y < -5, "dir -135 drives back-right", String.format("x %.1f y %.1f", r2b.p.x, r2b.p.y));

        Rig full = new Rig().start(0);
        full.runner.drive(0, 0.5, 1200);
        Rig weak = new Rig();
        weak.p.battery.volts = 11.6;
        weak.start(0);
        weak.runner.drive(0, 0.5, 1200);
        double ratio = weak.p.x / full.p.x;
        check(Math.abs(ratio - 1) < 0.02, "a weak battery (11.6 V) drives the same distance", String.format("%.1f vs %.1f in", weak.p.x, full.p.x));
        check(Math.abs(weak.p.fl.peak - 0.5 * 12.8 / 11.6) < 0.01, "power scaled by refVoltage / battery", String.format("%.3f", weak.p.fl.peak));
        Rig noComp = new Rig();
        noComp.p.battery.volts = 11.6;
        noComp.c.refVoltage = 0;
        noComp.start(0);
        noComp.runner.drive(0, 0.5, 1200);
        check(noComp.p.x / full.p.x < 0.93, "without compensation the weak battery falls short (sanity)", String.format("%.1f in", noComp.p.x));
        Rig dead = new Rig();
        dead.p.battery.volts = 8.0;
        dead.start(0);
        dead.runner.drive(0, 0.5, 300);
        check(Math.abs(dead.p.fl.peak - 0.5 * 1.25) < 0.01, "compensation is capped at 1.25x", String.format("%.3f", dead.p.fl.peak));

        Rig hold = new Rig().start(0);
        hold.p.drift = -20;
        hold.runner.drive(0, 0.5, 1500);
        Rig ponly = new Rig();
        ponly.c.headingKi = 0;
        ponly.start(0);
        ponly.p.drift = -20;
        ponly.runner.drive(0, 0.5, 1500);
        Rig loose = new Rig();
        loose.c.headingKp = 0;
        loose.c.headingKi = 0;
        loose.start(0);
        loose.p.drift = -20;
        loose.runner.drive(0, 0.5, 1500);
        check(Math.abs(hold.p.heading) < 1.0 && Math.abs(loose.p.heading) > 20, "IMU heading hold fights drift",
                String.format("held %.2f°, P only %.2f°, unheld %.1f°", hold.p.heading, ponly.p.heading, loose.p.heading));
        Rig calm = new Rig().start(0);
        calm.runner.drive(0, 0.5, 1500);
        check(Math.abs(calm.p.heading) < 0.05 && Math.abs(calm.p.y) < 0.05, "no drift: the hold stays quiet (no wobble)", String.format("%.3f°", calm.p.heading));

        Rig turn = new Rig().start(0);
        long tt = turn.op.nowMs;
        turn.runner.turnTo(90, 0.5);
        long turnMs = turn.op.nowMs - tt;
        check(Math.abs(wrap(turn.p.heading - 90)) <= 2.0 && turnMs < turn.c.turnTimeoutMs && turn.p.stopped(), "turnTo(90) arrives and stops",
                String.format("%.2f° in %d ms", turn.p.heading, turnMs));
        Rig wrapT = new Rig().start(170);
        double before = wrapT.p.heading;
        wrapT.runner.turnTo(-170, 0.5);
        check(Math.abs(wrap(wrapT.p.heading + 170)) <= 2.0 && Math.abs(wrap(wrapT.p.heading - before)) < 25, "turnTo takes the short way across ±180",
                String.format("%.2f°", wrapT.p.heading));
        Rig after = new Rig().start(0);
        after.runner.turnTo(90, 0.5).drive(0, 0.5, 600);
        check(after.p.y > 10 && Math.abs(after.p.x) < 1.5, "a drive after a turn goes along the new heading", String.format("x %.2f y %.1f", after.p.x, after.p.y));

        Rig wall = new Rig();
        wall.p.x = 40;
        wall.p.wallX = 63;
        wall.imu.bias = 0;
        wall.p.heading = 183;
        wall.runner = new OverTime(wall.op, wall.p.fl, wall.p.fr, wall.p.bl, wall.p.br, wall.imu, wall.c);
        wall.runner.begin(183);
        wall.runner.pushWall(OverTime.Face.BACK, 0.3, 2000, true);
        check(Math.abs(wrap(wall.p.heading - 180)) < 0.6, "pushing a flat side squares the robot", String.format("%.2f°", wall.p.heading));
        check(Math.abs(wrap(wall.runner.heading() - 180)) < 0.6, "align re-zeroes the heading to the wall", String.format("%.2f°", wall.runner.heading()));
        check(wall.p.x < 63 && wall.p.x > 60 && wall.p.stopped(), "backs off the wall a little and stops", String.format("x %.2f", wall.p.x));

        Rig bias = new Rig();
        bias.p.x = 50;
        bias.p.wallX = 63;
        bias.p.heading = 180;
        bias.runner = new OverTime(bias.op, bias.p.fl, bias.p.fr, bias.p.bl, bias.p.br, bias.imu, bias.c);
        bias.runner.begin(180);
        bias.imu.bias = 4;
        bias.runner.pushWall(OverTime.Face.BACK, 0.3, 1500, true);
        check(Math.abs(wrap(bias.runner.heading() - bias.p.heading)) < 0.6, "align removes IMU drift",
                String.format("runner %.2f°, true %.2f°", bias.runner.heading(), bias.p.heading));

        Rig lim = new Rig().start(0);
        lim.runner.waitMs(31000);
        check(Math.abs(lim.op.nowMs - 30000) <= 20, "steps stop at 30 s", lim.op.nowMs + " ms");
        double xBefore = lim.p.x;
        long nBefore = lim.op.nowMs;
        lim.runner.drive(0, 0.5, 1000);
        check(lim.p.x == xBefore && lim.op.nowMs == nBefore && lim.p.fl.peak == 0, "no steps after 30 s", "");

        Rig stop = new Rig().start(0);
        stop.op.stopAtMs = 500;
        stop.runner.drive(0, 0.5, 3000);
        check(stop.op.nowMs <= 510 && stop.p.stopped(), "STOP ends a drive at once", stop.op.nowMs + " ms");

        Rig mech = new Rig().start(0);
        FakeServo s = new FakeServo();
        final int[] ran = {0};
        mech.runner.registerCommand("score", new Runnable() {
            public void run() { ran[0]++; }
        });
        Motor intake = new Motor();
        long tm = mech.op.nowMs;
        mech.runner.servo(s, 0.65).command("score", 200).command("missing", 0).motor(intake, -1, 300);
        check(s.pos == 0.65, "servo step sets the position", "");
        check(ran[0] == 1, "registered command runs once; a missing one is skipped", "");
        check(intake.peak == 1 && intake.power == 0 && Math.abs(mech.op.nowMs - tm - 500) <= 20, "motor step runs for ms then stops",
                (mech.op.nowMs - tm) + " ms");

        Rig loop = new Rig().start(0);
        final int[] ticks = {0};
        final Motor feeder = new Motor();
        final boolean[] atSpeed = {false};
        loop.runner.onLoop(new Runnable() {
            public void run() { ticks[0]++; feeder.setPower(atSpeed[0] ? 1 : 0); }
        });
        loop.runner.drive(0, 0.5, 300);
        int afterDrive = ticks[0];
        loop.runner.turnTo(45, 0.5);
        int afterTurn = ticks[0];
        loop.runner.waitMs(200);
        check(afterDrive > 10 && afterTurn > afterDrive && ticks[0] > afterTurn, "onLoop runs during drive, turn and wait",
                afterDrive + " / " + afterTurn + " / " + ticks[0]);
        check(feeder.peak == 0, "onLoop: feeder stays off while not at speed", "");
        atSpeed[0] = true;
        loop.runner.waitMs(100);
        check(feeder.power == 1, "onLoop: feeder runs once at speed", "");
        loop.runner.onLoop(null);
        int ticksBefore = ticks[0];
        loop.runner.waitMs(100);
        check(ticks[0] == ticksBefore, "onLoop(null) removes it", "");

        Rig spin = new Rig().start(0);
        double rate = spin.runner.spinTest(0.5, 2000);
        check(Math.abs(rate - 150) < 5, "spinTest reports the turn rate", String.format("%.1f deg/s", rate));

        System.out.println(fails == 0 ? "ALL PASS" : "FAILED " + fails);
        if (fails > 0) System.exit(1);
    }
}
