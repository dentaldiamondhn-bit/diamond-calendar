import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    const clerk = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    let userList;

    if (userId) {
      const user = await clerk.users.getUser(userId);
      if (!user) {
        return NextResponse.json(null);
      }

      return NextResponse.json({
        id: user.id,
        first_name: user.firstName || '',
        last_name: user.lastName || '',
        email: user.emailAddresses?.[0]?.emailAddress || '',
        role: user.publicMetadata?.role || user.privateMetadata?.role || 'staff',
        profileImageUrl: user.imageUrl || null,
      });
    }

    userList = await clerk.users.getUserList({
      limit: 100,
      orderBy: '-created_at',
    });

    if (!userList) {
      return NextResponse.json([]);
    }

    const transformedUsers = Array.isArray(userList.data)
      ? userList.data.map((user: any) => ({
          id: user.id,
          first_name: user.firstName || '',
          last_name: user.lastName || '',
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          email: user.emailAddresses?.[0]?.emailAddress || '',
          role: user.publicMetadata?.role || user.privateMetadata?.role || 'STAFF',
          department: user.publicMetadata?.department || user.privateMetadata?.department || '',
          profileImageUrl: user.imageUrl || null,
          created_at: user.createdAt || new Date().toISOString(),
          updated_at: user.updatedAt || new Date().toISOString(),
        }))
      : [];

    return NextResponse.json(transformedUsers);
  } catch (error: any) {
    console.error('Error fetching users from Clerk:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || error },
      { status: 500 },
    );
  }
}
