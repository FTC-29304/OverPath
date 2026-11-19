package org.firstinspires.ftc.robotcore.external.navigation;
public class YawPitchRollAngles { private final double yawDeg; public YawPitchRollAngles(double y) { yawDeg = y; } public double getYaw(AngleUnit u) { return u == AngleUnit.DEGREES ? yawDeg : Math.toRadians(yawDeg); } }
