import { createCrudRouter } from './crud';

export default createCrudRouter({ table: 'employees', managerOnly: true });
