import nodemailer from 'nodemailer'

const sendEmail = async ({
  email,
  subject,
  text
}: {
  email: string
  subject: string
  text: string
}) => {
  try {
    console.log(
      process.env.HOST,
      process.env.SERVICE,
      process.env.EMAIL_PORT,
      process.env.SECURE,
      process.env.USER
    )
    const transporter = nodemailer.createTransport({
      host: process.env.HOST,
      service: process.env.SERVICE,
      port: Number(process.env.EMAIL_PORT),
      secure: Boolean(process.env.SECURE),
      auth: {
        user: process.env.USER,
        pass: process.env.PASS
      }
    })

    await transporter.sendMail({
      from: process.env.USER,
      to: email,
      subject: subject,
      text: text
    })

    console.log('Email sent Successfully')
  } catch (error) {
    console.log('Email not found')
    console.log(error)
  }
}

export { sendEmail }
