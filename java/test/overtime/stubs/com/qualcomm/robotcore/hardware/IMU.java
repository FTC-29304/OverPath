package com.qualcomm.robotcore.hardware;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;
public interface IMU extends HardwareDevice { class Parameters { public Parameters(ImuOrientationOnRobot o) {} }
  boolean initialize(Parameters p); void resetYaw(); YawPitchRollAngles getRobotYawPitchRollAngles(); }
