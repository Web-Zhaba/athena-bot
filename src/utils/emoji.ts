export function getWeatherEmoji(description: string, temp: number): string {
  const d = description.toLowerCase();

  if (temp < -10) return '🥶';
  if (temp > 30) return '🥵';
  if (d.includes('thunderstorm') || d.includes('гроза')) return '⛈️';
  if (d.includes('drizzle') || d.includes('light rain') || d.includes('мелкий дождь')) return '🌦️';
  if (d.includes('rain') || d.includes('дождь') || d.includes('ливень')) return '🌧️';
  if (d.includes('snow') || d.includes('sleet') || d.includes('снег')) return '❄️';
  if (d.includes('mist') || d.includes('fog') || d.includes('haze') || d.includes('туман')) return '🌫️';
  if (d.includes('clear') || d.includes('ясно')) return '☀️';
  if (d.includes('few clouds') || d.includes('небольшая облачность')) return '🌤️';
  if (d.includes('scattered clouds') || d.includes('облачно с прояснениями')) return '⛅';
  if (d.includes('broken clouds') || d.includes('переменная облачность')) return '🌥️';
  if (d.includes('cloud') || d.includes('облачно')) return '☁️';
  return '🌡️';
}
