import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * مستند HTML للويب (واجهة SDK 57): أيقونة WANAS (W أبيض + نقطة صفراء) في التاب
 * والمعاينة، ولون ثيم فحمي، مع الإبقاء على عقد headNodes/bodyNodes من الراوتر.
 */
export default function Root({ children }: PropsWithChildren) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();
  return (
    <html lang="ar" dir="rtl" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>WANAS — مساحة الونس</title>
        <meta name="theme-color" content="#000000" />
        <meta name="description" content="ونس — مساحة الونس: شبكة اجتماعية عربية دافئة" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="shortcut icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <meta property="og:image" content="/favicon.png" />
        <meta property="og:title" content="WANAS — مساحة الونس" />
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
