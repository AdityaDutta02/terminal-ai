export const ERROR_MESSAGES: Record<string, string> = {
  PREFLIGHT_FAILED: 'Pre-flight checks failed before deployment started',
  BUILD_FAILED: 'Application build failed during deployment',
  HEALTH_CHECK_FAILED: 'Health check did not pass after deployment',
  GATEWAY_UNREACHABLE: 'Terminal AI gateway could not be reached',
  COOLIFY_ERROR: 'Coolify returned an error during deployment',
  TIMEOUT: 'Deployment timed out before completing',
  SECRETS_DETECTED: 'Potential secrets detected in deployment payload',
}
