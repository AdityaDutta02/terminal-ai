import { CronExpressionParser } from 'cron-parser'

type ValidationResult = {
  valid: true
} | {
  valid: false
  error: string
}

export function validateCronSchedule(expression: string): ValidationResult {
  // Reject 6-field (with seconds) expressions
  if (expression.trim().split(/\s+/).length !== 5) {
    return { valid: false, error: 'Invalid cron expression: must have exactly 5 fields' }
  }

  let parsed
  try {
    parsed = CronExpressionParser.parse(expression)
  } catch {
    return { valid: false, error: `Invalid cron expression: ${expression}` }
  }

  // Enforce minimum 1-hour interval by checking the minute field.
  // If the minute field has more than one value or is a wildcard, it runs sub-hourly.
  const fields = parsed.fields
  const minuteField = fields.minute
  if (minuteField.values.length > 1) {
    return { valid: false, error: 'Minimum schedule interval is 1 hour. Sub-hour cron expressions are not allowed.' }
  }

  return { valid: true }
}

export function getNextRunAt(expression: string, timezone: string): string {
  const interval = CronExpressionParser.parse(expression, {
    currentDate: new Date(),
    tz: timezone,
  })
  return interval.next().toISOString()
}
