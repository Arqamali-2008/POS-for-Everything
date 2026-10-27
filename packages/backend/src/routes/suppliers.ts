import { createCrudRouter } from './crud';

export default createCrudRouter({ table: 'suppliers', managerOnly: true, searchFields: ['company_name', 'contact_person', 'phone'] });

