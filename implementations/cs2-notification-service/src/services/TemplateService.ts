import Handlebars from 'handlebars';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import {
  NotificationTemplate,
  CreateTemplateInput,
  UpdateTemplateInput,
  NotificationChannel,
} from '../models/types';
import { v4 as uuidv4 } from 'uuid';

export class TemplateService {
  private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor() {
    this.registerHelpers();
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('formatDate', (date: Date, format: string) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    Handlebars.registerHelper('formatCurrency', (amount: number, currency: string = 'NGN') => {
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency,
      }).format(amount);
    });

    Handlebars.registerHelper('uppercase', (str: string) => str?.toUpperCase());
    Handlebars.registerHelper('lowercase', (str: string) => str?.toLowerCase());
    Handlebars.registerHelper('capitalize', (str: string) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    });
  }

  async createTemplate(input: CreateTemplateInput): Promise<NotificationTemplate> {
    const client = await pool.connect();
    try {
      const id = uuidv4();
      const variables = this.extractVariables(input.bodyTemplate);

      const result = await client.query(
        `INSERT INTO notification_templates 
         (id, tenant_id, name, slug, channel, subject, body_template, locale, variables, is_active, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          id,
          input.tenantId,
          input.name,
          input.slug,
          input.channel,
          input.subject || null,
          input.bodyTemplate,
          input.locale || 'en',
          JSON.stringify(variables),
          true,
          JSON.stringify(input.metadata || {}),
        ]
      );

      const template = this.mapRowToTemplate(result.rows[0]);
      logger.info('Template created', { templateId: template.id, slug: template.slug });
      return template;
    } finally {
      client.release();
    }
  }

  async getTemplate(id: string): Promise<NotificationTemplate | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM notification_templates WHERE id = $1',
        [id]
      );
      return result.rows.length > 0 ? this.mapRowToTemplate(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async getTemplateBySlug(
    tenantId: string,
    slug: string,
    channel: NotificationChannel,
    locale: string = 'en'
  ): Promise<NotificationTemplate | null> {
    const client = await pool.connect();
    try {
      let result = await client.query(
        `SELECT * FROM notification_templates 
         WHERE tenant_id = $1 AND slug = $2 AND channel = $3 AND locale = $4 AND is_active = true`,
        [tenantId, slug, channel, locale]
      );

      if (result.rows.length === 0 && locale !== 'en') {
        result = await client.query(
          `SELECT * FROM notification_templates 
           WHERE tenant_id = $1 AND slug = $2 AND channel = $3 AND locale = 'en' AND is_active = true`,
          [tenantId, slug, channel]
        );
      }

      if (result.rows.length === 0) {
        result = await client.query(
          `SELECT * FROM notification_templates 
           WHERE tenant_id = 'system' AND slug = $1 AND channel = $2 AND locale = $3 AND is_active = true`,
          [slug, channel, locale]
        );
      }

      return result.rows.length > 0 ? this.mapRowToTemplate(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async listTemplates(
    tenantId: string,
    channel?: NotificationChannel,
    limit: number = 100,
    offset: number = 0
  ): Promise<NotificationTemplate[]> {
    const client = await pool.connect();
    try {
      let query = 'SELECT * FROM notification_templates WHERE tenant_id = $1';
      const params: any[] = [tenantId];

      if (channel) {
        query += ' AND channel = $2';
        params.push(channel);
      }

      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await client.query(query, params);
      return result.rows.map(this.mapRowToTemplate);
    } finally {
      client.release();
    }
  }

  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<NotificationTemplate> {
    const client = await pool.connect();
    try {
      const setClauses: string[] = ['updated_at = NOW()'];
      const values: any[] = [];
      let paramCount = 1;

      if (input.name !== undefined) {
        setClauses.push(`name = $${paramCount++}`);
        values.push(input.name);
      }
      if (input.subject !== undefined) {
        setClauses.push(`subject = $${paramCount++}`);
        values.push(input.subject);
      }
      if (input.bodyTemplate !== undefined) {
        setClauses.push(`body_template = $${paramCount++}`);
        values.push(input.bodyTemplate);
        const variables = this.extractVariables(input.bodyTemplate);
        setClauses.push(`variables = $${paramCount++}`);
        values.push(JSON.stringify(variables));
        this.compiledTemplates.delete(id);
      }
      if (input.locale !== undefined) {
        setClauses.push(`locale = $${paramCount++}`);
        values.push(input.locale);
      }
      if (input.isActive !== undefined) {
        setClauses.push(`is_active = $${paramCount++}`);
        values.push(input.isActive);
      }
      if (input.metadata !== undefined) {
        setClauses.push(`metadata = $${paramCount++}`);
        values.push(JSON.stringify(input.metadata));
      }

      values.push(id);

      const result = await client.query(
        `UPDATE notification_templates SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error(`Template not found: ${id}`);
      }

      return this.mapRowToTemplate(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async deleteTemplate(id: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM notification_templates WHERE id = $1', [id]);
      this.compiledTemplates.delete(id);
      logger.info('Template deleted', { templateId: id });
    } finally {
      client.release();
    }
  }

  renderTemplate(template: NotificationTemplate, data: Record<string, any>): { subject?: string; body: string } {
    let compiledBody = this.compiledTemplates.get(template.id);
    if (!compiledBody) {
      compiledBody = Handlebars.compile(template.bodyTemplate);
      this.compiledTemplates.set(template.id, compiledBody);
    }

    let subject: string | undefined;
    if (template.subject) {
      const compiledSubject = Handlebars.compile(template.subject);
      subject = compiledSubject(data);
    }

    return {
      subject,
      body: compiledBody(data),
    };
  }

  private extractVariables(template: string): string[] {
    const regex = /\{\{(?:#|\^)?(?:each |if |unless )?([a-zA-Z_][a-zA-Z0-9_.]*)/g;
    const variables = new Set<string>();
    let match;

    while ((match = regex.exec(template)) !== null) {
      const variable = match[1].split('.')[0];
      if (!['this', 'else', 'each', 'if', 'unless', 'with'].includes(variable)) {
        variables.add(variable);
      }
    }

    return Array.from(variables);
  }

  private mapRowToTemplate(row: any): NotificationTemplate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      slug: row.slug,
      channel: row.channel,
      subject: row.subject,
      bodyTemplate: row.body_template,
      locale: row.locale,
      variables: row.variables,
      isActive: row.is_active,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const templateService = new TemplateService();
