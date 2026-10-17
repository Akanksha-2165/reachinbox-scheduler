import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env.js';

export interface EmailDocument {
  id: string;
  recipient?: string;
  subject?: string;
  body?: string;
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | string;
  scheduledAt?: Date | string;
  sentAt?: Date | string | null;
  senderId?: string;
}

export interface SearchEmailsParams {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface SearchEmailsResult {
  total: number;
  emails: EmailDocument[];
}

/**
 * Elasticsearch Client Instance
 * Configured via ELASTICSEARCH_NODE (default: http://localhost:9200)
 */
export const esClient = new Client({
  node: env.ELASTICSEARCH_NODE,
});

/**
 * Creates the "emails" index on API startup if it does not already exist.
 *
 * MAPPING SPECIFICATION:
 * - recipient:   text + keyword (allows full-text token search and exact term queries)
 * - subject:     text (full-text analyzed)
 * - body:        text (full-text analyzed)
 * - status:      keyword (exact filter: scheduled, sending, sent, failed)
 * - scheduledAt: date (ISO-8601 timestamps)
 * - sentAt:      date (nullable delivery timestamp)
 * - senderId:    keyword (sender identifier)
 *
 * RESILIENCE:
 * If Elasticsearch is unreachable, this catches the error, logs a warning,
 * and does not crash the server.
 */
export async function initElasticsearchIndex(): Promise<void> {
  try {
    const exists = await esClient.indices.exists({ index: env.ELASTICSEARCH_INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: env.ELASTICSEARCH_INDEX,
        mappings: {
          properties: {
            recipient: {
              type: 'text',
              fields: {
                keyword: {
                  type: 'keyword',
                  ignore_above: 256,
                },
              },
            },
            subject: { type: 'text' },
            body: { type: 'text' },
            status: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
            senderId: { type: 'keyword' },
          },
        },
      });
      console.log(`🔍 [Elasticsearch] Created index "${env.ELASTICSEARCH_INDEX}" with required schema mappings.`);
    } else {
      console.log(`🔍 [Elasticsearch] Index "${env.ELASTICSEARCH_INDEX}" already exists and is ready.`);
    }
  } catch (error) {
    console.warn(
      `⚠️  [Elasticsearch] Unable to initialize index "${env.ELASTICSEARCH_INDEX}" (ES may be offline):`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Idempotently indexes or updates an email document in Elasticsearch.
 * Uses the email ID as the document ID so duplicate calls are safely idempotent.
 *
 * RESILIENCE:
 * If Elasticsearch is down or rejects the request, the error is logged as a warning
 * and execution continues without throwing.
 */
export async function indexOrUpdateEmail(
  doc: Partial<EmailDocument> & { id: string }
): Promise<void> {
  try {
    await esClient.update({
      index: env.ELASTICSEARCH_INDEX,
      id: doc.id,
      doc,
      doc_as_upsert: true,
      refresh: true, // Guarantees search visibility immediately for automated tests
    });
  } catch (error) {
    console.warn(
      `⚠️  [Elasticsearch] Failed to index/update email document ${doc.id} (ES may be offline):`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Search emails in Elasticsearch using multi_match on subject, body, recipient,
 * with optional status filtering.
 */
export async function searchEmails(
  params: SearchEmailsParams
): Promise<SearchEmailsResult> {
  const { q, status, limit = 50, offset = 0 } = params;

  const must: any[] = [];
  const filter: any[] = [];

  if (q && q.trim().length > 0) {
    must.push({
      multi_match: {
        query: q.trim(),
        fields: ['subject', 'body', 'recipient', 'recipient.keyword'],
        type: 'best_fields',
      },
    });
  }

  if (status && status.trim().length > 0) {
    filter.push({
      term: { status: status.trim() },
    });
  }

  let query: any;
  if (must.length > 0 && filter.length > 0) {
    query = { bool: { must, filter } };
  } else if (must.length > 0) {
    query = must[0];
  } else if (filter.length > 0) {
    query = { bool: { filter } };
  } else {
    query = { match_all: {} };
  }

  // Sort by relevance score if search text provided; otherwise by scheduledAt desc
  const sort: any[] = q && q.trim().length > 0
    ? ['_score', { scheduledAt: { order: 'desc', unmapped_type: 'date' } }]
    : [{ scheduledAt: { order: 'desc', unmapped_type: 'date' } }];

  const response = await esClient.search({
    index: env.ELASTICSEARCH_INDEX,
    from: offset,
    size: limit,
    query,
    sort,
  });

  const totalValue =
    typeof response.hits.total === 'number'
      ? response.hits.total
      : (response.hits.total?.value ?? 0);

  const emails: EmailDocument[] = response.hits.hits.map((hit) => {
    const source = hit._source as any;
    return {
      id: hit._id ?? source?.id,
      recipient: source?.recipient,
      subject: source?.subject,
      body: source?.body,
      status: source?.status,
      scheduledAt: source?.scheduledAt,
      sentAt: source?.sentAt ?? null,
      senderId: source?.senderId,
      _score: hit._score ?? undefined,
    };
  });

  return {
    total: totalValue,
    emails,
  };
}
