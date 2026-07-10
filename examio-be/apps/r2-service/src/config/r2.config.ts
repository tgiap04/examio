export const r2Config = {
    region: 'auto',
    endpoint:
        process.env.R2_ENDPOINT ||
        'https://your_account_id.r2.cloudflarestorage.com',
    bucket: process.env.R2_BUCKET_NAME || 'examio',
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    publicBaseUrl:
        process.env.R2_PUBLIC_URL || 'https://examio-r2.fayedark.com',
    // Folder prefixes that hold private user content (documents, AI uploads, etc.).
    // Keys under these prefixes must be served via short-lived presigned URLs
    // instead of the permanent public URL. See R2ServiceService.isPrivateKey.
    privatePrefixes: (
        process.env.R2_PRIVATE_PREFIXES || 'ai-uploads,ai-teacher,documents'
    )
        .split(',')
        .map((prefix) => prefix.trim())
        .filter(Boolean),
};
