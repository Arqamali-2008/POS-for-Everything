import { createCrudRouter } from './crud';

export default createCrudRouter({ table: 'categories', searchFields: ['name'] });

