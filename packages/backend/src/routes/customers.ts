import { createCrudRouter } from './crud';

export default createCrudRouter({ table: 'customers', searchFields: ['name', 'phone'] });

