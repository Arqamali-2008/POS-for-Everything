import { createCrudRouter } from './crud';

export default createCrudRouter({ table: 'loans', managerOnly: true, searchFields: ['person_name', 'phone'] });

