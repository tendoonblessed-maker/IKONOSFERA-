'use client';

import {useEffect,useRef,useState,type ReactNode,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {autoUpdate,flip,offset,shift,FloatingFocusManager,FloatingPortal,useClick,useDismiss,useFloating,useInteractions,useRole} from '@floating-ui/react';
import {nextFloatingMenuIndex,nextFloatingMenuTypeaheadIndex} from '@/lib/floating-menu-keyboard';

type Props={
  label:string;
  children:ReactNode;
  trigger?:ReactNode;
  wrapperClassName?:string;
  triggerClassName?:string;
  popupClassName?:string;
};

/**
 * Anchored menu using MIT-licensed Floating UI.
 * Unlike an absolutely-positioned <details>, the menu is portaled outside
 * scroll containers and automatically flips/shifts inside narrow iPhone screens.
 */
export default function FloatingActionMenu({
  label,children,trigger='···',
  wrapperClassName='',triggerClassName='',popupClassName=''
}:Props){
  const [open,setOpen]=useState(false);
  const menuRef=useRef<HTMLDivElement|null>(null);
  const typeaheadBufferRef=useRef('');
  const typeaheadTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const {refs,floatingStyles,context}=useFloating({
    open,onOpenChange:setOpen,placement:'bottom-end',strategy:'fixed',
    whileElementsMounted:autoUpdate,
    middleware:[offset(7),flip({padding:12}),shift({padding:12,crossAxis:true})]
  });
  const click=useClick(context);
  const dismiss=useDismiss(context,{outsidePress:true,escapeKey:true});
  const role=useRole(context,{role:'menu'});
  const {getReferenceProps,getFloatingProps}=useInteractions([click,dismiss,role]);

  useEffect(()=>{
    if(!open)return;
    const panel=menuRef.current;
    if(!panel)return;
    const items=Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const original=items.map(item=>({
      item,
      role:item.getAttribute('role'),
      tabIndex:item.getAttribute('tabindex')
    }));
    items.forEach((item,index)=>{
      item.setAttribute('role','menuitem');
      item.tabIndex=index===0?0:-1;
    });
    return()=>{
      if(typeaheadTimerRef.current!==null)clearTimeout(typeaheadTimerRef.current);
      typeaheadTimerRef.current=null;
      typeaheadBufferRef.current='';
      original.forEach(({item,role,tabIndex})=>{
        if(role===null)item.removeAttribute('role');
        else item.setAttribute('role',role);
        if(tabIndex===null)item.removeAttribute('tabindex');
        else item.setAttribute('tabindex',tabIndex);
      });
    };
  },[open]);

  const onMenuKeyDown=(event:ReactKeyboardEvent<HTMLDivElement>)=>{
    const panel=menuRef.current;
    if(!panel||event.nativeEvent.isComposing||event.key==='Process')return;
    const items=Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const currentIndex=items.findIndex(item=>item===document.activeElement);
    const nextIndex=nextFloatingMenuIndex(event.key,currentIndex,items.length);
    if(nextIndex!==null){
      event.preventDefault();
      if(typeaheadTimerRef.current!==null)clearTimeout(typeaheadTimerRef.current);
      typeaheadTimerRef.current=null;
      typeaheadBufferRef.current='';
      items.forEach((item,index)=>{item.tabIndex=index===nextIndex?0:-1;});
      items[nextIndex]?.focus();
      return;
    }
    if(event.altKey||event.ctrlKey||event.metaKey||Array.from(event.key).length!==1||event.key.trim()==='')return;
    const labels=items.map(item=>item.getAttribute('aria-label')||item.textContent||'');
    const bufferedQuery=typeaheadBufferRef.current+event.key;
    let query=bufferedQuery;
    let typeaheadIndex=nextFloatingMenuTypeaheadIndex(labels,currentIndex,query);
    if(typeaheadIndex===null&&bufferedQuery!==event.key){
      query=event.key;
      typeaheadIndex=nextFloatingMenuTypeaheadIndex(labels,currentIndex,query);
    }
    if(typeaheadIndex===null){
      if(typeaheadTimerRef.current!==null)clearTimeout(typeaheadTimerRef.current);
      typeaheadTimerRef.current=null;
      typeaheadBufferRef.current='';
      return;
    }
    event.preventDefault();
    items.forEach((item,index)=>{item.tabIndex=index===typeaheadIndex?0:-1;});
    items[typeaheadIndex]?.focus();
    typeaheadBufferRef.current=query;
    if(typeaheadTimerRef.current!==null)clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current=setTimeout(()=>{
      typeaheadBufferRef.current='';
      typeaheadTimerRef.current=null;
    },700);
  };

  return <span className={'ik-floating-menu-anchor '+wrapperClassName}>
    <button type="button" ref={refs.setReference}
      className={'ik-floating-menu-trigger '+triggerClassName}
      {...getReferenceProps({'aria-label':label,'title':label,'aria-expanded':open})}>
      {trigger}
    </button>
    {open&&<FloatingPortal>
      <FloatingFocusManager context={context} modal={false} returnFocus>
        <div ref={node=>{menuRef.current=node;refs.setFloating(node);}} style={floatingStyles}
          {...getFloatingProps({
            className:'ik-floating-menu-panel '+popupClassName,
            onKeyDown:onMenuKeyDown,
            onClick:(event)=>{
              const target=event.target;
              if(target instanceof Element&&target.closest('button'))setOpen(false);
            }
          })}>
          {children}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>}
  </span>;
}
