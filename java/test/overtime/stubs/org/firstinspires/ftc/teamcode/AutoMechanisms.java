package org.firstinspires.ftc.teamcode;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

import org.firstinspires.ftc.teamcode.overtime.OverTime;

public final class AutoMechanisms {
    private AutoMechanisms() {
    }

    public static void register(LinearOpMode op, OverTime runner) {
        runner.registerCommand("shoot", new Runnable() {
            public void run() {
            }
        });
        runner.onLoop(null);
        op.idle();
    }
}
