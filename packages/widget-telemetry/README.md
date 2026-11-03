# Telemetry

Numeral overlay for the OBS browser source at `/telemetry`. The source width and height are the panel. A 440×126 source matches the layout this page was drawn at, and other sizes keep the same arrangement.

- Gear, centered on the same line as speed and steering, in `--number`. It is slightly larger than those figures and sits above the traces. A forward gear is its digit, neutral is `N`, reverse is `R`.
- RPM lights, centered in the gap above the gear. Fifteen rectangles, each three times as wide as it is tall: five green (`--good`), five red (`--bad`), and five blue (`--accent`). An unlit light is `--rule`. The first ten walk from `DriverCarSLFirstRPM` to `DriverCarSLShiftRPM`. The blue five walk from the shift point to `DriverCarSLLastRPM`. At `DriverCarSLBlinkRPM` the whole bar flashes.
- Speed, top right. Metric sessions (`DisplayUnits` 1) show `km/h`. Imperial sessions show `mph`. The figure is the rounded absolute speed. The unit uses `--number`.
- Steering, top left, mirroring speed. A wheel icon, then `L` or `R`, then the absolute angle. The letter sits on the outer side of the angle the way `km/h` sits on the outer side of the speed, and it uses the same size, color, weight, and tracking. When the rounded angle is 0°, that place is a non-breaking space so the angle stays put relative to the wheel. The spokes form a Y, and the orange mark stays at the top of the rim. Positive `SteeringWheelAngle` is treated as a left turn, and the wheel graphic rotates with that letter.
- Five seconds of clutch, brake, and throttle on the left, bottom, and right edges of the panel. The trace keeps its height. The panel is shorter by the gap that used to sit above the trace and the pad that used to sit below it. The newest sample is at the right edge. A stall longer than 100 ms breaks the line instead of drawing a ramp.
- Three vertical bars flush with the right edge of the trace, touching, unlabeled. Order is clutch, brake, throttle. Clutch uses `--accent`, brake uses `--bad`, throttle uses `--good`. An empty bar is the `--rule` track. All three show pedal travel, full when the pedal is pressed.

While the server reports `idle`, the panel is fully hidden and keeps the last frame.
