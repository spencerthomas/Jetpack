import { NextResponse } from 'next/server';
import { LoginRequestSchema } from '@jetpack/shared';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate request body
    const parseResult = LoginRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request: email and password are required' },
        { status: 400 }
      );
    }

    const { email, password } = parseResult.data;

    // TODO: Replace with actual user lookup and password verification
    // For now, this is a placeholder implementation
    // In production, you would:
    // 1. Look up user by email in database
    // 2. Verify password hash
    // 3. Generate JWT or session token

    // Placeholder validation - reject empty credentials
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Placeholder: Generate a simple token (in production, use JWT)
    const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');

    // Placeholder user response
    const user = {
      id: `user-${Date.now()}`,
      email,
      name: email.split('@')[0],
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      user,
      token,
    });
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
