package com.qualcomm.robotcore.hardware;
public interface DcMotorEx extends DcMotor { default double getVelocity() { return 0; } }
