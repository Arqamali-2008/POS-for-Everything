import { createCrudRouter } from './crud';

export default createCrudRouter({ table: 'suppliers', managerOnly: true });
