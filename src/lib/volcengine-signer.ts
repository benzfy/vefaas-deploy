import crypto from 'crypto';

interface SignerConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
}

interface RequestOptions {
  method: string;
  host: string;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * 火山引擎 API 签名器
 * 实现 HMAC-SHA256 签名算法
 * 参考: https://www.volcengine.com/docs/6369/67269
 */
export class VolcengineSigner {
  private config: SignerConfig;

  constructor(config: SignerConfig) {
    this.config = config;
  }

  private sha256(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  private hmacSha256(key: Buffer | string, data: string): Buffer {
    return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
  }

  private hmacSha256Hex(key: Buffer | string, data: string): string {
    return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
  }

  private getCanonicalQueryString(query?: Record<string, string>): string {
    if (!query || Object.keys(query).length === 0) return '';
    return Object.keys(query)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`)
      .join('&');
  }

  sign(options: RequestOptions): Record<string, string> {
    const now = new Date();
    // 格式: 20060102T150405Z
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const xDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    // 计算 body hash
    const bodyHash = this.sha256(options.body || '');

    // 准备要签名的 headers（小写 key）
    const headersToSign: Record<string, string> = {
      'host': options.host,
      'x-date': xDate,
      'x-content-sha256': bodyHash,
      'content-type': 'application/json',
    };

    // 排序的 header keys
    const sortedKeys = Object.keys(headersToSign).sort();
    
    // canonical headers: 每行是 "key:value\n"
    const canonicalHeaders = sortedKeys
      .map(key => `${key}:${headersToSign[key].trim()}`)
      .join('\n') + '\n';

    // signed headers
    const signedHeaders = sortedKeys.join(';');

    // canonical query string
    const canonicalQueryString = this.getCanonicalQueryString(options.query);

    // canonical request
    const canonicalRequest = [
      options.method,
      options.path,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      bodyHash,
    ].join('\n');

    // string to sign
    const algorithm = 'HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.config.region}/${this.config.service}/request`;
    const stringToSign = [
      algorithm,
      xDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join('\n');

    // 计算签名
    const kDate = this.hmacSha256(this.config.secretAccessKey, dateStamp);
    const kRegion = this.hmacSha256(kDate, this.config.region);
    const kService = this.hmacSha256(kRegion, this.config.service);
    const kSigning = this.hmacSha256(kService, 'request');
    const signature = this.hmacSha256Hex(kSigning, stringToSign);

    // authorization header
    const authorization = `${algorithm} Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // 返回完整的 headers（使用正常的大小写）
    return {
      'Host': options.host,
      'X-Date': xDate,
      'X-Content-Sha256': bodyHash,
      'Content-Type': 'application/json',
      'Authorization': authorization,
    };
  }
}
