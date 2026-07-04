import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// 录音文件存储目录
const STORAGE_DIR = process.env.DATA_STORAGE_PATH 
  ? path.join(process.env.DATA_STORAGE_PATH, 'recordings')
  : path.join(process.cwd(), 'data', 'recordings');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  
  // 防止路径遍历攻击
  if (filename.includes('..')) {
    return NextResponse.json(
      { success: false, error: '非法文件名' },
      { status: 400 }
    );
  }

  const filePath = path.join(STORAGE_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { success: false, error: '文件不存在' },
      { status: 404 }
    );
  }

  const fileBuffer = fs.readFileSync(filePath);
  
  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
}
