import { createCrudRouter } from './crud';

export default createCrudRouter({ table: 'expenses', managerOnly: true, searchFields: ['description', 'category'] });

