package com.qualcomm.robotcore.hardware;
public interface DcMotorSimple extends HardwareDevice { enum Direction { FORWARD, REVERSE } void setDirection(Direction d); void setPower(double p); double getPower(); }
