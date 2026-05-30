const SEOUL_TIMEZONE = 'Asia/Seoul';

/**
 * Serializes a Date to an ISO 8601 string in Asia/Seoul timezone.
 * Use this in response DTOs and mappers to satisfy the API timestamp contract.
 */
export function toSeoulIso(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: SEOUL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  })
    .format(date)
    .replace(' ', 'T')
    .replace(',', '.')
    .concat('+09:00');
}
