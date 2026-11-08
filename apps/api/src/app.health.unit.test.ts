import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createLivenessHandler, createReadinessHandler } from './app.js';

function responseMock() {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return response;
}

const request = {} as Request;

describe('health handlers', () => {
  it('reports readiness when the database probe succeeds', async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    const response = responseMock();
    await createReadinessHandler(probe)(request, response as unknown as Response);
    expect(probe).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ready' }, error: null });
  });

  it.each(['database unavailable', 'DATABASE_READINESS_TIMEOUT'])(
    'sanitizes probe failure: %s',
    async (detail) => {
      const response = responseMock();
      await createReadinessHandler(() => Promise.reject(new Error(detail)))(
        request,
        response as unknown as Response,
      );
      expect(response.statusCode).toBe(503);
      expect(response.body).toEqual({
        data: null,
        error: { code: 'DATABASE_NOT_READY', message: 'Database is not ready' },
      });
      expect(JSON.stringify(response.body)).not.toContain(detail);
    },
  );

  it('keeps process liveness healthy independently of database readiness', () => {
    const response = responseMock();
    createLivenessHandler()(request, response as unknown as Response);
    expect(response.statusCode).toBe(200);
    expect((response.body as { data: { status: string } }).data.status).toBe('ok');
  });
});
