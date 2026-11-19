package com.qualcomm.hardware.lynx;
public class LynxModule implements com.qualcomm.robotcore.hardware.HardwareDevice {
  public enum BulkCachingMode { OFF, AUTO, MANUAL }
  public BulkCachingMode mode = BulkCachingMode.OFF; public int clears;
  public void setBulkCachingMode(BulkCachingMode m) { mode = m; } public BulkCachingMode getBulkCachingMode() { return mode; }
  public void clearBulkCache() { clears++; }
}
