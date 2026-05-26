import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ai_chat_messages')
export class AiChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ai_chat_session_id', type: 'uuid' })
  aiChatSessionId!: string;

  @Column({ name: 'ai_chat_request_id', type: 'uuid', nullable: true })
  aiChatRequestId!: string | null;

  @Column({ name: 'sender_type', type: 'text' })
  senderType!: string;

  @Column({ name: 'sender_user_id', type: 'uuid', nullable: true })
  senderUserId!: string | null;

  @Column({ name: 'message_type', type: 'text' })
  messageType!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'metadata_json', type: 'jsonb', nullable: true })
  metadataJson!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
