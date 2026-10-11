// =============================================
// Colores por proceso
// ---------------------------------------------

// Devuelve un color estable para cada PID; el angulo aureo separa bien los tonos vecinos
export function get_pid_color(pid, lightness) {
  const hue = (pid * 137) % 360;
  return `hsl(${hue}, 65%, ${lightness}%)`;
}
