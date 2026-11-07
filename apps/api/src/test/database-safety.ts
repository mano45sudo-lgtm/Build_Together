const ISOLATED_NAME = /(?:^|[_-])test(?:$|[_-])/i;
const FORBIDDEN_NAME = /(?:^|[_-])(dev|development|prod|production)(?:$|[_-])/i;

export interface TestDatabaseTarget {
  url: URL;
  databaseName: string;
}

/** Parse a test database URL without ever including the raw URL in an error. */
export function parseIsolatedTestDatabaseUrl(raw: string | undefined): TestDatabaseTarget {
  if (!raw) {
    throw new Error('TEST_DATABASE_URL is required; integration tests will not use DATABASE_URL');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('TEST_DATABASE_URL must use PostgreSQL');
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error('TEST_DATABASE_URL must target a local isolated PostgreSQL instance');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (
    !databaseName ||
    !/^[A-Za-z0-9_-]+$/.test(databaseName) ||
    !ISOLATED_NAME.test(databaseName) ||
    FORBIDDEN_NAME.test(databaseName) ||
    databaseName.toLowerCase() === 'buildtogether'
  ) {
    throw new Error('TEST_DATABASE_URL database name must be clearly isolated with a test marker');
  }

  return { url, databaseName };
}

/** Confirm the connected server's identity before any test cleanup is allowed. */
export function assertTestDatabaseIdentity(expectedName: string, actualName: string): void {
  if (
    actualName !== expectedName ||
    !ISOLATED_NAME.test(actualName) ||
    FORBIDDEN_NAME.test(actualName)
  ) {
    throw new Error(
      'Connected PostgreSQL database identity does not match the isolated test database',
    );
  }
}
