package com.qualcomm.robotcore.eventloop.opmode;
import com.qualcomm.robotcore.hardware.*; import org.firstinspires.ftc.robotcore.external.Telemetry;
public abstract class LinearOpMode { public HardwareMap hardwareMap; public Telemetry telemetry; public Gamepad gamepad1, gamepad2;
  public abstract void runOpMode() throws InterruptedException; public void waitForStart() {} public boolean opModeIsActive() { return true; } public boolean isStopRequested() { return false; } public boolean opModeInInit() { return false; } public void idle() {} public final void sleep(long ms) {} }
