import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';

@Entity('ai_chat_requests')
export class AiChatRequest extends BaseEntity {
  @Column({ name: 'ai_chat_session_id', type: 'uuid' })
  aiChatSessionId!: string;

  @Column({ name: 'request_type', type: 'text' })
  requestType!: string;

  @Column({ name: 'source_message_id', type: 'uuid', nullable: true })
  sourceMessageId!: string | null;

  @Column({ name: 'request_payload', type: 'jsonb' })
  requestPayload!: Record<string, unknown>;

  @Column({ name: 'response_payload', type: 'jsonb', nullable: true })
  responsePayload!: Record<string, unknown> | null;

  @Column({ type: 'text' })
  status!: string;

  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt!: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;
}
