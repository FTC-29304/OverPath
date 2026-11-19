package com.qualcomm.robotcore.util;
public class ElapsedTime { public static long fakeNanos; private long start = now(); private static long now() { return fakeNanos; }
  public void reset() { start = now(); } public double milliseconds() { return (now() - start) / 1e6; } public double seconds() { return (now() - start) / 1e9; } }
