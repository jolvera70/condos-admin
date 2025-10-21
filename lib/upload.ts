// lib/upload.ts
export type PresignResp = { key: string; uploadUrl: string };
export type CompleteResp = { key: string; url: string; contentType: string; size: number };

export async function presignAttachment(boardId: string, taskId: string, contentType: string, size: number) {
  return await apiAuth(
    `/condos/api/board/${boardId}/tasks/${taskId}/attachments/presign`,
    "POST",
    { contentType, size }
  ) as PresignResp;
}

export async function completeAttachment(boardId: string, taskId: string, key: string, contentType: string, size: number) {
  return await apiAuth(
    `/condos/api/board/${boardId}/tasks/${taskId}/attachments/complete`,
    "POST",
    { key, contentType, size }
  ) as CompleteResp;
}