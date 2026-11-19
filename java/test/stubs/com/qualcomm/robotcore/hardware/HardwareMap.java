package com.qualcomm.robotcore.hardware;
import java.util.*;
public class HardwareMap {
  public final Map<String, HardwareDevice> devices = new LinkedHashMap<String, HardwareDevice>();
  public <T> T get(Class<? extends T> c, String name) { HardwareDevice d = devices.get(name); if (d == null) throw new IllegalArgumentException("Unable to find a hardware device with name \"" + name + "\""); return c.cast(d); }
  public <T> List<T> getAll(Class<? extends T> c) { List<T> out = new ArrayList<T>(); for (HardwareDevice d : devices.values()) if (c.isInstance(d)) out.add(c.cast(d)); return out; }
}
