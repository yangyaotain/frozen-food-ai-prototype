import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function load(cache = new Map(), unavailable = false, readOnly = false) {
  const session = new Map(), storage = { getItem(key) { if (unavailable) throw Error('Unavailable'); return cache.get(key) ?? null; }, setItem(key, value) { if (unavailable || readOnly) throw Error('Unavailable'); cache.set(key, value); } };
  const context = { window: { localStorage: storage, sessionStorage: { getItem:k=>session.get(k)??null, setItem:(k,v)=>session.set(k,v) }, location:{search:'',hash:''} }, URL, URLSearchParams, Event: class { constructor(type) { this.type = type; } } };
  // Isolate profile/permission migration from report presentation setup, which has its own full-entry check.
  for (const m of read('admin/index.html').matchAll(/<script defer src="..\/assets\/js\/([^"]+)"><\/script>/g)) if (!['shell.js', 'admin-example-states.js'].includes(m[1])) vm.runInNewContext(read('assets/js/' + m[1]), context, {filename:m[1]});
  return { app: context.window.FrozenApp, cache, context };
}
const loaded = load(), a = loaded.app, s = a.systemStore;
assert.equal(a.config.admin.routes.length, 9); assert.equal(a.config.merchant.routes.length, 5);
assert.equal(s.list('users').length, 5); assert.equal(s.list('roles').length, 5);
assert.deepEqual(clone(s.list('users').map(u=>u.name)), ['陈建华','沈佳宁','周明远','徐悦','陆文博']);
assert.ok(s.list('users').every(u=>u.email.includes('@') && u.department));
for (const p of s.catalog) assert.ok(a.config.admin.routes.some(r=>r.id===p.id));
for (const action of ['read','maintain','review','publish']) assert.equal(a.access.can(action),true);
assert.equal(a.access.set,undefined); assert.doesNotMatch(read('assets/js/shell.js'), /data-demo-org|data-demo-role|access\.note/);
const roleInput = {name:'市场观察员',code:'market.observer',description:'查看市场分析',status:'enabled',permissions:['analysis:view']};
const before = JSON.stringify(s.list('roles'));
assert.equal(s.save('roles',{...roleInput,permissions:['fake:publish']}).valid,false);
assert.equal(s.save('roles',{...roleInput,permissions:[]}).valid,false);
assert.equal(JSON.stringify(s.list('roles')),before);
let r=s.save('roles',{...roleInput,permissions:['bulletins:publish']}).row;
assert.deepEqual(clone(r.permissions),['bulletins:publish','bulletins:view']);
assert.equal(s.save('roles',{...roleInput,code:'MARKET.OBSERVER'}).valid,false);
assert.equal(s.save('roles',{...roleInput,code:'other.code'}).valid,false,'角色名称也不可重复');
assert.equal(s.save('roles',r,r.id,r.version).unchanged,true);
assert.equal(s.save('roles',{...r,status:'disabled'},r.id,r.version).valid,false,'资料编辑不能改变启停状态');
assert.equal(s.save('roles',{...r,code:'changed'},r.id,r.version).valid,false);
assert.throws(()=>s.save('roles',r,r.id,999),/记录已变化/);
const userInput = {account:'market.observer',name:'市场观察员戊',phone:'13800000006',status:'enabled',roleIds:[r.id,'reviewer']};
let u=s.save('users',userInput).row;
assert.ok(s.effective(u).includes('bulletins:publish')); assert.ok(s.effective(u).includes('prices:review'));
assert.equal(s.effective(u).filter(p=>p==='bulletins:view').length,1);
assert.equal(s.save('users',{...userInput,account:'MARKET.OBSERVER'}).valid,false);
assert.equal(s.save('users',{...userInput,account:'bad account'}).valid,false);
assert.equal(s.save('users',{...userInput,account:'new.account',phone:'12'}).valid,false);
assert.equal(s.save('users',{...userInput,account:'new.account',roleIds:[]}).valid,false);
assert.equal(s.save('users',u,u.id,u.version).unchanged,true);
assert.equal(s.save('users',{...u,status:'disabled'},u.id,u.version).valid,false,'用户启停只能通过独立状态操作');
assert.equal(s.save('users',{...u,account:'changed'},u.id,u.version).valid,false);
assert.throws(()=>s.change('roles',r.id,r.version,'delete'),/关联用户/);
s.change('roles',r.id,r.version,'status'); r=s.get('roles',r.id);
assert.ok(!s.effective(u).includes('bulletins:publish')); assert.ok(s.effective(u).includes('prices:review'));
assert.equal(s.save('users',{...userInput,account:'new.account'}).valid,false,'停用角色不可新增分配');
assert.equal(s.save('users',u,u.id,u.version).unchanged,true,'已有停用角色可保留');
s.change('users',u.id,u.version,'status'); u=s.get('users',u.id); assert.equal(s.effective(u).length,0);
s.change('users',u.id,u.version,'status'); u=s.get('users',u.id);
const stale=u.version; u=s.save('users',{...u,roleIds:['reviewer']},u.id,u.version).row;
assert.throws(()=>s.change('users',u.id,stale,'delete'),/记录已变化/);
s.change('roles',r.id,r.version,'delete'); assert.equal(s.get('roles',r.id),null);
assert.equal(s.roleNames(u.roleIds),'复核员');
const admin=s.current(), builtin=s.get('roles','administrator');
assert.equal(s.save('users',{...admin,roleIds:['reviewer']},admin.id,admin.version).valid,false);
assert.equal(s.save('users',{...admin,status:'disabled'},admin.id,admin.version).valid,false);
for (const action of ['status','delete']) { assert.throws(()=>s.change('users',admin.id,admin.version,action),/不可/); assert.throws(()=>s.change('roles',builtin.id,builtin.version,action),/不可/); }
assert.throws(()=>s.save('roles',builtin,builtin.id,builtin.version),/不可修改/);
assert.throws(()=>s.save('invalid',{}),/未知/);
// 当前姓名只影响之后的业务操作，历史人员及旧版本保持原值。
const price=a.priceStore.records[0], oldHistory=JSON.stringify(price.history), seed=a.bulletinStore.list()[0], oldBulletin=JSON.stringify(seed);
const renamed=s.save('users',{...admin,name:'市场管理员林'},admin.id,admin.version); assert.equal(renamed.valid,true);
assert.equal(a.actor('fallback'),'市场管理员林');
assert.equal(a.priceStore.save({start:price.week.id,category:price.category.id,price:String(price.price+1),unit:price.unit,note:'身份联动'},price.id).valid,true);
assert.equal(price.editor,'市场管理员林'); assert.equal(price.history.at(-1).actor,'市场管理员林'); assert.equal(JSON.stringify(price.history.slice(0,-1)),oldHistory);
assert.equal(a.priceStore.review(price.id,'reviewed','核对').valid,true); assert.equal(price.history.at(-1).actor,'市场管理员林');
const next=a.bulletinStore.regenerate(seed.id,seed.version); assert.equal(next.history.at(-1).actor,'市场管理员林');
assert.throws(()=>a.bulletinStore.publish(next.id,next.version),/尚未复核/);
a.bulletinStore.review(next.id,next.version,'approved','核对当前版本'); a.bulletinStore.publish(next.id,next.version);
assert.equal(a.bulletinStore.get(next.id,next.version).publication.actor,'市场管理员林');
assert.equal(JSON.stringify(a.bulletinStore.get(seed.id,seed.version)),oldBulletin);
const saved = loaded.cache.get(s.key), restored=load(new Map([[s.key,saved]])).app.systemStore;
// 新字段兼容旧资料：定向更新旧预置姓名，保留自定义姓名、关联、时间及内部版本。
const oldProfiles=JSON.parse(saved);
const oldPrice=oldProfiles.users.find(u=>u.id==='user-price'); oldPrice.name='采价管理员甲';
const customProfile=oldProfiles.users.find(user=>user.id===u.id);
for (const user of oldProfiles.users) { delete user.email; delete user.department; }
const oldProfilesText=JSON.stringify(oldProfiles), upgraded=load(new Map([[s.key,oldProfilesText]]));
assert.equal(upgraded.app.systemStore.current().name,'市场管理员林');
assert.equal(upgraded.app.systemStore.get('users','user-price').name,'沈佳宁');
assert.equal(upgraded.app.systemStore.get('users','user-price').version,oldPrice.version);
assert.equal(upgraded.app.systemStore.get('users','user-price').createdAt,oldPrice.createdAt);
assert.deepEqual(clone(upgraded.app.systemStore.get('users',u.id).roleIds),customProfile.roleIds);
assert.equal(upgraded.app.systemStore.get('users',u.id).email,'');
assert.equal(upgraded.app.systemStore.get('users',u.id).department,'');
const upgradeText=upgraded.cache.get(s.key);assert.equal(load(new Map([[s.key,upgradeText]])).cache.get(s.key),upgradeText);
const cannotWriteProfiles=load(new Map([[s.key,oldProfilesText]]),false,true);
assert.equal(cannotWriteProfiles.cache.get(s.key),oldProfilesText);assert.equal(cannotWriteProfiles.app.systemStore.get('users','user-price').name,'沈佳宁');
const personal=restored.current(), personalBefore=JSON.stringify(personal);
assert.equal(restored.saveProfile({...personal,email:'invalid'},personal.version).valid,false);
assert.equal(restored.saveProfile({...personal,department:'部'.repeat(41)},personal.version).valid,false);
assert.equal(restored.saveProfile({...personal,department:'任意输入的新部门'},personal.version).valid,false);
assert.equal(JSON.stringify(restored.current()),personalBefore);
const own=restored.saveProfile({...personal,name:'陈思远',email:' siyuan.chen@example.com ',department:' 运营管理部 ',account:'changed',roleIds:['reviewer'],status:'disabled'},personal.version).row;
assert.equal(own.name,'陈思远');assert.equal(own.email,'siyuan.chen@example.com');assert.equal(own.department,'运营管理部');
assert.equal(own.account,personal.account);assert.equal(own.status,personal.status);assert.deepEqual(clone(own.roleIds),clone(personal.roleIds));
assert.equal(restored.saveProfile(own,own.version).unchanged,true);
assert.throws(()=>restored.saveProfile(personal,personal.version),/记录已变化/);
restored.saveProfile({...own,name:personal.name},own.version);
assert.equal(JSON.parse(saved).schema,2);
assert.equal(restored.current().name,'市场管理员林'); assert.equal(restored.get('users',u.id).account,u.account);
// 旧分配权限并入维护：保留全部资料和关联，迁移幂等，失败不覆盖旧缓存。
const legacy=JSON.parse(saved); legacy.schema=1;
legacy.roles.find(r=>r.id==='administrator').permissions.push('users:assign','roles:assign');
legacy.roles.find(r=>r.id==='reviewer').permissions=['users:view','users:assign','roles:view','roles:assign','sources:view','sources:publish'];
const legacyText=JSON.stringify(legacy), migration=load(new Map([[s.key,legacyText]]));
assert.equal(migration.app.systemStore.storageState(),'ready');
assert.deepEqual(clone(migration.app.systemStore.list('users')),legacy.users);
for(const role of legacy.roles){const expected={...role,permissions:[...new Set(role.permissions.map(p=>p==='users:assign'?'users:maintain':p==='roles:assign'?'roles:maintain':p))].sort()};assert.deepEqual(clone(migration.app.systemStore.get('roles',role.id)),expected);}
assert.ok(migration.app.systemStore.effective(migration.app.systemStore.get('users',u.id)).includes('roles:maintain'));
const migratedText=migration.cache.get(s.key);assert.equal(JSON.parse(migratedText).schema,2);
assert.equal(load(new Map([[s.key,migratedText]])).cache.get(s.key),migratedText);
const readOnlyMigration=load(new Map([[s.key,legacyText]]),false,true);
assert.equal(readOnlyMigration.app.systemStore.storageState(),'unavailable');assert.equal(readOnlyMigration.cache.get(s.key),legacyText);
assert.equal(readOnlyMigration.app.systemStore.current().name,'市场管理员林');
assert.ok(readOnlyMigration.app.systemStore.get('roles','reviewer').permissions.includes('users:maintain'));
const invalidLegacy=clone(legacy);invalidLegacy.roles[0].permissions.push('unknown:assign');const invalidText=JSON.stringify(invalidLegacy), invalidLoad=load(new Map([[s.key,invalidText]]));
assert.equal(invalidLoad.app.systemStore.storageState(),'invalid');assert.equal(invalidLoad.cache.get(s.key),invalidText);
const corrupted=JSON.parse(saved); corrupted.users.find(r=>r.id==='user-admin').roleIds=[];
assert.equal(load(new Map([[s.key,JSON.stringify(corrupted)]])).app.systemStore.storageState(),'invalid');
assert.equal(load(new Map([[s.key,'{bad']])).app.systemStore.storageState(),'invalid');
const volatile=load(new Map(),true).app.systemStore; assert.equal(volatile.storageState(),'unavailable');
assert.equal(volatile.save('roles',roleInput).valid,true); assert.equal(volatile.storageState(),'unavailable'); assert.equal(volatile.list('roles').length,6);
const cached=loaded.cache.get(s.key); a.access.end(); assert.throws(()=>s.save('roles',roleInput),/会话已退出/); assert.equal(a.reportStore.list().length,0); assert.equal(loaded.cache.get(s.key),cached); a.access.start();
// Node 事件替身：检查筛选触发时机、权限树选择与静态正文，不运行浏览器。
function node() {
  const children=new Map(), listeners={}, fields=new Map(); let html='';
  const n={listeners,dataset:{},value:'',textContent:'',checked:false,indeterminate:false,disabled:false,hidden:false,isConnected:true,
    addEventListener(type,fn){(listeners[type]??=[]).push(fn);}, fire(type,event={}){for(const fn of listeners[type]||[])fn({preventDefault(){},...event});}, focus(){this.focused=true;}, setAttribute(){},removeAttribute(){},
    querySelector(selector){if(!children.has(selector))children.set(selector,node());return children.get(selector);},
    querySelectorAll(selector){ if(!selector.includes('data-permission-group'))return []; const matches=[]; for(const m of html.matchAll(/data-permission-(group|page)="([^"]+)"/g)){ const child=n.querySelector('[data-permission-'+m[1]+'="'+m[2]+'"]');child.dataset[m[1]==='group'?'permissionGroup':'permissionPage']=m[2];matches.push(child);}return matches;},
    elements:{namedItem(key){if(!fields.has(key)){const f=node();f.name=key;fields.set(key,f);}return fields.get(key);}},
    reset(){for(const f of fields.values())f.value='';},close(){this.closed=true;},dispatchEvent(event){this.fire(event.type,event);},closest(){return null;}
  };
  Object.defineProperty(n,'innerHTML',{get:()=>html,set:value=>{html=value;children.clear();}}); return n;
}
const pickerHost=node(), picker=a.systemUI.permissionPicker(pickerHost,[]), tree=pickerHost.querySelector('.permission-tree');
// 实际公共组织树：模糊匹配保留并展开父路径、无匹配、选择、清空、搜索不提交。
const departmentHost=node(), departmentPicker=a.treeSelect(departmentHost,'department','部门',s.departments,'信息技术部');
const departmentList=departmentHost.querySelector('[data-tree-options]'), departmentSearch=departmentHost.querySelector('input[type="search"]');
assert.equal(departmentPicker.value(),'信息技术部');
assert.match(departmentHost.innerHTML,/type="hidden" name="department"/);assert.doesNotMatch(departmentHost.innerHTML,/type="text"/);
departmentSearch.value='市场信息';departmentSearch.fire('input');
assert.match(departmentList.innerHTML,/杭州五丰/);assert.match(departmentList.innerHTML,/市场运营中心/);assert.match(departmentList.innerHTML,/市场信息部/);assert.match(departmentList.innerHTML,/<details[^>]* open>/);assert.doesNotMatch(departmentList.innerHTML,/信息技术部|运营管理部/);
departmentSearch.value='市场运营';departmentSearch.fire('input');assert.match(departmentList.innerHTML,/市场信息部/);assert.match(departmentList.innerHTML,/运营管理部/);
departmentSearch.value='没有这个组织';departmentSearch.fire('input');assert.match(departmentList.innerHTML,/没有匹配的部门/);assert.equal(departmentPicker.value(),'信息技术部');
let searchPrevented=false;departmentSearch.fire('keydown',{key:'Enter',preventDefault(){searchPrevented=true;}});assert.equal(searchPrevented,true);
departmentSearch.value='运营';departmentSearch.fire('input');
departmentList.fire('click',{target:{closest(){return {dataset:{treeValue:'运营管理部'}};}}});assert.equal(departmentPicker.value(),'运营管理部');assert.equal(departmentHost.querySelector('[data-tree-label]').textContent,'杭州五丰 / 市场运营中心 / 运营管理部');
departmentHost.querySelector('[data-tree-clear]').fire('click');assert.equal(departmentPicker.value(),'');
const treeChange=(dataset,checked)=>tree.fire('change',{target:{dataset,checked}});
treeChange({permission:'bulletins:publish'},true); assert.ok(picker.value().includes('bulletins:view'));
assert.equal(tree.querySelector('[data-permission-page="bulletins"]').indeterminate,true);
const search=pickerHost.querySelector('input[type="search"]'); search.value='发布简报'; search.fire('input'); assert.match(tree.innerHTML,/分析与发布/);assert.match(tree.innerHTML,/市场行情简报/);assert.doesNotMatch(tree.innerHTML,/每周平均采价/);
search.value='不存在的权限';search.fire('input');assert.match(tree.innerHTML,/没有匹配/);assert.equal(picker.value().length,2);
search.value='';search.fire('input');treeChange({permission:'bulletins:view'},false);assert.equal(picker.value().length,0);
treeChange({permissionGroup:'系统管理'},true);assert.ok(picker.value().includes('users:delete'));assert.ok(picker.value().includes('roles:maintain'));assert.ok(!picker.value().some(p=>p.endsWith(':assign')));
treeChange({permissionGroup:'系统管理'},false);assert.equal(picker.value().length,0);
const roleHost=node();a.pages['admin:roles'](roleHost,{id:'roles'});const form=roleHost.querySelector('form'),rows=roleHost.querySelector('[data-rows]');
assert.match(rows.innerHTML,/系统管理员/);form.elements.namedItem('keyword').value='发布员';form.fire('input');assert.match(rows.innerHTML,/系统管理员/,'输入文本不立即查询');
form.fire('submit');assert.match(rows.innerHTML,/发布员/);assert.doesNotMatch(rows.innerHTML,/系统管理员/);
form.elements.namedItem('status').value='disabled';form.fire('change',{target:{name:'status'}});assert.match(rows.innerHTML,/没有匹配/);
form.elements.namedItem('keyword').value='';form.elements.namedItem('status').value='';form.fire('submit');
for(let i=0;i<11;i++)s.save('roles',{...roleInput,name:'观察角色'+i,code:'observer.'+i});
const userHost=node();a.pages['admin:users'](userHost,{id:'users'});
assert.match(userHost.innerHTML,/<select[^>]*name="role"/);
assert.doesNotMatch(userHost.querySelector('form').querySelector('[data-role-filter]').innerHTML,/type="search"/);
assert.match(userHost.innerHTML,/<th>账号<\/th><th>姓名<\/th>/);assert.match(userHost.innerHTML,/<th>邮箱<\/th><th>部门<\/th>/);
assert.ok([...userHost.querySelector('[data-rows]').innerHTML.matchAll(/<tr>(.*?)<\/tr>/g)].every(m=>(m[1].match(/<td[ >]/g)||[]).length===9));
const userForm=userHost.querySelector('form');userForm.elements.namedItem('keyword').value='沈佳宁';userForm.elements.namedItem('role').value='reviewer';userForm.fire('change',{target:{name:'role'}});
assert.match(userHost.querySelector('[data-rows]').innerHTML,/colspan="9"/);
userForm.elements.namedItem('role').value='';userForm.fire('change',{target:{name:'role'}});assert.match(userHost.querySelector('[data-rows]').innerHTML,/沈佳宁/);
userForm.reset();userForm.fire('submit');
const htmls=[departmentHost.innerHTML,departmentList.innerHTML,roleHost.innerHTML,rows.innerHTML,userHost.innerHTML,userHost.querySelector('[data-rows]').innerHTML,a.account.markup(),a.systemUI.permissionSummary(s.allPermissions)];
assert.match(userHost.querySelector('[data-rows]').innerHTML,/杭州五丰 \/ 综合管理中心 \/ 信息技术部/);
assert.doesNotMatch(rows.innerHTML + userHost.querySelector('[data-rows]').innerHTML,/data-system-action="assign"|分配角色|配置权限/);
assert.equal(s.catalog.find(p=>p.id==='users').permissions.length,4);assert.equal(s.catalog.find(p=>p.id==='roles').permissions.length,4);
// 从列表的编辑入口提交资料和角色/权限，一次写入同一版本；状态仍由列表处理。
let editing;
Object.defineProperty(a, 'openDetailPage', { get: () => a.openDialog, configurable: true });
a.openDialog=(host,title,body,footer)=>{htmls.push(body,footer||'');editing=node();editing.title=title;editing.body=body;return editing;};
a.account.refresh=()=>{};
const clickAction=(host,action,id)=>host.fire('click',{target:{dataset:{systemAction:action,id},closest(selector){return selector==='dialog, .task-workspace'?null:this;}}});
const editUser=s.get('users',u.id);clickAction(userHost,'edit',u.id);
assert.equal(editing.title,'编辑用户');assert.match(editing.body,/基本信息/);assert.match(editing.body,/所属角色/);assert.doesNotMatch(editing.body,/<select[^>]*name="status"/);
assert.doesNotMatch(editing.querySelector('[data-picker]').innerHTML,/type="search"/);assert.match(editing.body,/name="email"/);assert.match(editing.body,/name="department"/);
assert.match(editing.querySelector('[data-department-picker]').innerHTML,/tree-select/);
let editForm=editing.querySelector('form');for(const key of ['name','account','phone'])editForm.elements.namedItem(key).value=editUser[key];
editForm.elements.namedItem('name').value='资料角色一次更新';editForm.elements.namedItem('status').value='disabled';
editing.querySelector('[data-picker]').querySelector('.role-options').fire('change',{target:{checked:true,value:'maintainer'}});
editForm.fire('submit');let combined=s.get('users',u.id);assert.equal(combined.name,'资料角色一次更新');assert.ok(combined.roleIds.includes('maintainer'));assert.equal(combined.status,editUser.status);assert.equal(combined.version,editUser.version+1);
let editRole=s.get('roles','reviewer');s.change('roles',editRole.id,editRole.version,'status');editRole=s.get('roles','reviewer');
clickAction(roleHost,'edit',editRole.id);assert.equal(editing.title,'编辑角色');assert.match(editing.body,/功能权限/);assert.doesNotMatch(editing.body,/<select[^>]*name="status"/);
editForm=editing.querySelector('form');for(const key of ['name','code','description'])editForm.elements.namedItem(key).value=editRole[key];
editForm.elements.namedItem('description').value='角色说明与权限同时维护';editForm.elements.namedItem('status').value='enabled';
editing.querySelector('[data-picker]').querySelector('.permission-tree').fire('change',{target:{dataset:{permission:'users:maintain'},checked:true}});
editForm.fire('submit');combined=s.get('roles',editRole.id);assert.equal(combined.description,'角色说明与权限同时维护');assert.ok(combined.permissions.includes('users:maintain'));assert.equal(combined.status,'disabled');assert.equal(combined.version,editRole.version+1);
clickAction(userHost,'create');assert.match(editing.body,/创建后默认启用/);editForm=editing.querySelector('form');
for(const [key,value] of Object.entries({account:'combined.editor',name:'合并入口用户',phone:'13800000009'}))editForm.elements.namedItem(key).value=value;
editing.querySelector('[data-picker]').querySelector('.role-options').fire('change',{target:{checked:true,value:'maintainer'}});editForm.fire('submit');assert.equal(s.list('users',{keyword:'combined.editor'})[0].status,'enabled');
// 个人入口无权限配置，取消不保存，保存同步当前页，管理详情仍保留权限。
let refreshes=0;a.account.refresh=()=>{refreshes++;};
a.systemUI.profile(userHost);assert.doesNotMatch(editing.body,/生效权限|资料版本|更新时间/);assert.match(editing.body,/邮箱/);
editing.querySelector('[data-profile-edit]').fire('click');assert.equal(editing.title,'编辑个人资料');
assert.match(editing.querySelector('[data-department-picker]').innerHTML,/tree-select/);
assert.doesNotMatch(editing.body,/name="account"|name="roleIds"|name="status"|data-picker/);
const beforeCancel=JSON.stringify(s.current());editing.querySelector('form').elements.namedItem('name').value='未保存姓名';editing.querySelector('[data-profile-cancel]').fire('click');assert.equal(JSON.stringify(s.current()),beforeCancel);
editing.querySelector('[data-profile-edit]').fire('click');editForm=editing.querySelector('form');
for(const key of ['name','phone','email','department'])editForm.elements.namedItem(key).value=s.current()[key];
editForm.elements.namedItem('email').value='invalid';editForm.fire('submit');assert.equal(JSON.stringify(s.current()),beforeCancel);assert.match(editForm.querySelector('[data-error="email"]').textContent,/邮箱/);
editForm.elements.namedItem('email').value='lin.chen@example.com';editForm.elements.namedItem('name').value='陈霖';editForm.elements.namedItem('department').value='信息技术部';editForm.fire('submit');
assert.equal(s.current().name,'陈霖');assert.equal(refreshes,1);assert.equal(editing.title,'用户信息');assert.match(editing.body,/个人资料已保存/);assert.match(userHost.querySelector('[data-rows]').innerHTML,/陈霖/);
assert.match(editing.body,/杭州五丰 \/ 综合管理中心 \/ 信息技术部/);
a.openDialog=(host,title,body,footer)=>{htmls.push(body,footer||'');editing={body};return node();};a.systemUI.userDetail(node(),'user-admin');assert.match(editing.body,/合并后的生效权限/);assert.doesNotMatch(editing.body,/资料版本|更新时间/);a.systemUI.roleDetail(node(),'reviewer');
for(const html of htmls){assert.doesNotMatch(html,/undefined|NaN/);const stack=[];for(const m of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b[^>]*>/gi)){const tag=m[2].toLowerCase();if(['input','br','hr','img','meta','link','path','circle','rect'].includes(tag))continue;if(m[1])assert.equal(stack.pop(),tag,html);else stack.push(tag);}assert.deepEqual(stack,[]);}
assert.match(a.systemUI.permissionSummary(['bulletins:publish']),/发布简报/);
assert.doesNotMatch(read('merchant/index.html'),/system-store|admin-system|account\.js/);
console.log('PASS: consolidated editing and permissions, legacy cache migration/idempotence/failure preservation, list-only status changes, system CRUD/protection, multi-role permissions, immutable actors, persistence, session guards, filter events and HTML structure. Node/static only; no browser verification.');
