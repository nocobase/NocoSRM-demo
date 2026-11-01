import { useState } from 'react';
import { useTranslation, useLocale } from '@nocobase/i18n/client';
import { zhCN, enUS } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '#components/ui/calendar';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '#components/ui/popover';
import { Button } from '#components/ui/button';

export function DateFilter({
  from,
  to,
  onChange,
}: {
  from?: string | null;
  to?: string | null;
  onChange: (from?: string, to?: string) => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const initial = () => ({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  const [range, setRange] = useState<DateRange | undefined>(initial);
  const [open, setOpen] = useState(false);
  const format = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(
      new Date(value),
    );
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (value) setRange(initial());
        setOpen(value);
      }}
    >
      <PopoverTrigger render={<Button variant='outline' />}>
        <CalendarIcon />
        {from && to ? `${format(from)} – ${format(to)}` : t('srm.dateRange')}
      </PopoverTrigger>
      <PopoverContent className='w-auto p-3' align='start'>
        <div className='flex flex-col gap-3'>
          <div className='flex gap-2'>
            {[7, 30].map((days) => (
              <Button
                key={days}
                variant='ghost'
                size='sm'
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(end.getDate() - days + 1);
                  setRange({ from: start, to: end });
                }}
              >
                {t('srm.lastDays', { days })}
              </Button>
            ))}
          </div>
          <Calendar
            mode='range'
            locale={locale === 'zh-CN' ? zhCN : enUS}
            selected={range}
            onSelect={setRange}
            numberOfMonths={1}
          />
          <div className='flex justify-end gap-2'>
            <Button
              variant='ghost'
              onClick={() => {
                onChange();
                setOpen(false);
              }}
            >
              {t('srm.clear')}
            </Button>
            <Button
              disabled={!range?.from || !range.to}
              onClick={() => {
                const start = new Date(range!.from!);
                start.setHours(0, 0, 0, 0);
                const end = new Date(range!.to!);
                end.setHours(23, 59, 59, 999);
                onChange(start.toISOString(), end.toISOString());
                setOpen(false);
              }}
            >
              {t('srm.apply')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
