package org.firstinspires.ftc.robotcore.external;
public interface Telemetry { Object addData(String c, String f, Object... a); Object addData(String c, Object v); Object addLine(String l); boolean update(); }
