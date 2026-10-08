import TransitionLink from "@/components/transition-link";
import { ReactNode } from "react";
import { List } from "zmp-ui";

function DeliverySummary(props: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  description?: string;
  linkTo?: string;
  linkState?: unknown;
}) {
  return (
    <List.Item
    
      prefix={props.icon}
      suffix={
        props.linkTo && (
          <TransitionLink
            to={props.linkTo}
            state={props.linkState}
            style={{
              fontWeight:'500',
              fontSize:'13px',
              color: "var(--primary)",
            }}
          >
            Thay đổi
          </TransitionLink>
        )
      }
      
      title={props.title}
    >
      <div className="flex-1 flex flex-col space-y-0.5">
        {props.subtitle && <span className="text-sm">{props.subtitle}</span>}
        {props.description && (
          <span className="text-xs" style={{color:'#4A4A4A'}}>{props.description}</span>
        )}
      </div>
    </List.Item>
  );
}

export default DeliverySummary;
