package com.qualcomm.hardware.rev;
public class RevHubOrientationOnRobot implements com.qualcomm.robotcore.hardware.ImuOrientationOnRobot {
  public enum LogoFacingDirection { UP, DOWN, FORWARD, BACKWARD, LEFT, RIGHT } public enum UsbFacingDirection { UP, DOWN, FORWARD, BACKWARD, LEFT, RIGHT }
  public RevHubOrientationOnRobot(LogoFacingDirection l, UsbFacingDirection u) {} }
