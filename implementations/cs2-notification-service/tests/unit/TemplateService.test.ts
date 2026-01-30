import Handlebars from 'handlebars';

describe('TemplateService', () => {
  describe('Template Rendering', () => {
    beforeAll(() => {
      Handlebars.registerHelper('formatCurrency', (amount: number, currency: string = 'NGN') => {
        return new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency,
        }).format(amount);
      });

      Handlebars.registerHelper('uppercase', (str: string) => str?.toUpperCase());
      Handlebars.registerHelper('capitalize', (str: string) => {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      });
    });

    it('should render a simple template with variables', () => {
      const template = 'Hello {{userName}}, welcome to {{companyName}}!';
      const compiled = Handlebars.compile(template);
      const result = compiled({ userName: 'John', companyName: 'WebWaka' });
      
      expect(result).toBe('Hello John, welcome to WebWaka!');
    });

    it('should render template with missing variables as empty', () => {
      const template = 'Hello {{userName}}, your email is {{email}}';
      const compiled = Handlebars.compile(template);
      const result = compiled({ userName: 'John' });
      
      expect(result).toBe('Hello John, your email is ');
    });

    it('should render template with custom helpers', () => {
      const template = 'Total: {{formatCurrency amount "NGN"}}';
      const compiled = Handlebars.compile(template);
      const result = compiled({ amount: 5000 });
      
      expect(result).toContain('5,000');
    });

    it('should render template with uppercase helper', () => {
      const template = '{{uppercase status}}';
      const compiled = Handlebars.compile(template);
      const result = compiled({ status: 'success' });
      
      expect(result).toBe('SUCCESS');
    });

    it('should render template with conditional blocks', () => {
      const template = '{{#if isVip}}VIP Customer{{else}}Regular Customer{{/if}}';
      const compiled = Handlebars.compile(template);
      
      expect(compiled({ isVip: true })).toBe('VIP Customer');
      expect(compiled({ isVip: false })).toBe('Regular Customer');
    });

    it('should render template with array iteration', () => {
      const template = 'Items: {{#each items}}{{this.name}}, {{/each}}';
      const compiled = Handlebars.compile(template);
      const result = compiled({ items: [{ name: 'Apple' }, { name: 'Banana' }] });
      
      expect(result).toBe('Items: Apple, Banana, ');
    });
  });

  describe('Variable Extraction', () => {
    function extractVariables(template: string): string[] {
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

    it('should extract simple variables', () => {
      const template = 'Hello {{userName}}, welcome to {{companyName}}';
      const variables = extractVariables(template);
      
      expect(variables).toContain('userName');
      expect(variables).toContain('companyName');
    });

    it('should extract variables from conditional blocks', () => {
      const template = '{{#if isActive}}Active{{/if}} - {{userName}}';
      const variables = extractVariables(template);
      
      expect(variables).toContain('isActive');
      expect(variables).toContain('userName');
    });

    it('should not include reserved words', () => {
      const template = '{{#each items}}{{this.name}}{{/each}}';
      const variables = extractVariables(template);
      
      expect(variables).toContain('items');
      expect(variables).not.toContain('this');
      expect(variables).not.toContain('each');
    });
  });
});
