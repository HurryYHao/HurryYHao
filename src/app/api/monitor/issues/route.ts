import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { recordIssue } from '@/lib/server/monitor-manager';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const moduleFilter = searchParams.get('module');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    const client = getSupabaseClient();
    let query = client
      .from('monitor_issues')
      .select('*', { count: 'exact' })
      .order('last_occurred_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);
    if (moduleFilter) query = query.eq('module', moduleFilter);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) throw new Error(`Query failed: ${error.message}`);

    return NextResponse.json({
      success: true,
      data: {
        issues: data || [],
        total: count || 0,
        page,
        pageSize
      }
    });
  } catch (error) {
    console.error('Issues query error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const issueId = await recordIssue({
      issue_type: data.issue_type || 'unknown',
      severity: data.severity || 'warning',
      module: data.module || 'unknown',
      title: data.title,
      description: data.description,
      error_details: data.error_details,
      log_snippet: data.log_snippet,
      environment: data.environment,
      reproduction_steps: data.reproduction_steps
    });

    return NextResponse.json({
      success: true,
      data: { id: issueId }
    });
  } catch (error) {
    console.error('Record issue error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing issue ID' },
        { status: 400 }
      );
    }

    const data = await request.json();
    const client = getSupabaseClient();

    const { error } = await client
      .from('monitor_issues')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', parseInt(id, 10));

    if (error) throw new Error(`Update failed: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update issue error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
