'use client';

import {useState,type ReactNode} from 'react';
import {
  autoUpdate,flip,offset,shift,FloatingFocusManager,FloatingPortal,
  useClick,useDismiss,useFloating,useInteractions,useRole
} from '@floating-ui/react';

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
  const {refs,floatingStyles,context}=useFloating({
    open,onOpenChange:setOpen,placement:'bottom-end',strategy:'fixed',
    whileElementsMounted:autoUpdate,
    middleware:[offset(7),flip({padding:12}),shift({padding:12,crossAxis:true})]
  });
  const click=useClick(context);
  const dismiss=useDismiss(context,{outsidePress:true,escapeKey:true});
  const role=useRole(context,{role:'menu'});
  const {getReferenceProps,getFloatingProps}=useInteractions([click,dismiss,role]);

  return <span className={'ik-floating-menu-anchor '+wrapperClassName}>
    <button type="button" ref={refs.setReference}
      className={'ik-floating-menu-trigger '+triggerClassName}
      {...getReferenceProps({'aria-label':label,'title':label,'aria-expanded':open})}>
      {trigger}
    </button>
    {open&&<FloatingPortal>
      <FloatingFocusManager context={context} modal={false} returnFocus>
        <div ref={refs.setFloating} style={floatingStyles}
          {...getFloatingProps({
            className:'ik-floating-menu-panel '+popupClassName,
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
