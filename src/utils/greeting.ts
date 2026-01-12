export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function formatGreeting(name: string, time: TimeOfDay): string {
  const greetings: Record<TimeOfDay, string> = {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
  };

  return `${greetings[time]}, ${name}!`;
}

export function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return 'morning';
  } else if (hour >= 12 && hour < 17) {
    return 'afternoon';
  } else {
    return 'evening';
  }
}
